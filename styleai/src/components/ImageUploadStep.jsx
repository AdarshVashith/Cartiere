import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { uploadToCloudinary } from "../utils/cloudinary";

function ImageUploadStep({ user, faceScanResult, onComplete }) {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadedItems, setUploadedItems] = useState([]);

  const handleFileSelection = (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }

    setFiles((current) => {
      if (current.length >= 2) {
        setStatus("You can only add 2 full-body photos.");
        return current;
      }

      setStatus("");
      return [...current, nextFile];
    });

    // Allow selecting the same file name again if needed.
    event.target.value = "";
  };

  const removeFile = (indexToRemove) => {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setStatus("");
  };

  const handleUpload = async () => {
    if (!files.length) {
      setStatus("Please choose 2 full-body photos.");
      return;
    }

    if (files.length !== 2) {
      setStatus("Please upload exactly 2 full-body photos.");
      return;
    }

    setLoading(true);
    setStatus("Uploading full-body photos...");

    try {
      const uploads = await Promise.all(
        files.map(async (file) => {
          let downloadURL = "";
          try {
            downloadURL = await uploadToCloudinary(file, "styleai/body-photos");
          } catch (error) {
            throw new Error("Failed to upload image. Please try again.");
          }

          return {
            name: file.name,
            downloadURL
          };
        })
      );

      const bodyPhotoUrls = uploads.map((item) => item.downloadURL);
      await setDoc(
        doc(db, "users", user.uid),
        {
          bodyPhotoUrls,
          bodyPhotosDone: true
        },
        { merge: true }
      );

      setUploadedItems(uploads);
      setStatus("Upload complete. Continue to body details.");
      onComplete(uploads);
    } catch (uploadError) {
      const rawMessage = String(uploadError?.message || "");
      setStatus(rawMessage || "Failed to upload image. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card onboarding-stage-card fade-in-up">
      <header className="onboarding-stage-header">
        <p className="onboarding-stage-kicker">Geometric Reference</p>
        <h2 className="onboarding-stage-title">Body Mapping</h2>
        <p className="onboarding-stage-copy">
          Add two full-body references so the avatar engine can understand your proportions and how garments should fall.
        </p>
      </header>

      <div className="onboarding-summary-grid">
        {[
          { label: 'Baseline Tone', value: faceScanResult?.skinTone },
          { label: 'Geometry', value: faceScanResult?.faceShape },
          { label: 'Biometrics', value: faceScanResult?.dominantExpression }
        ].map((stat, i) => (
          <div key={i} className="onboarding-metric-card">
            <p>{stat.label}</p>
            <strong>{stat.value || 'Verified'}</strong>
          </div>
        ))}
      </div>

      <div className="stack">
        <div className="onboarding-photo-guides">
          <article className="onboarding-guide-card">
            <span>Front pose</span>
            <p>Stand straight with the full body visible.</p>
          </article>
          <article className="onboarding-guide-card">
            <span>Clean frame</span>
            <p>Bright light and uncluttered background work best.</p>
          </article>
          <article className="onboarding-guide-card">
            <span>Natural fit</span>
            <p>Wear fitted basics so proportions read correctly.</p>
          </article>
        </div>

        <label className={`onboarding-upload-dropzone ${files.length >= 2 ? 'disabled' : ''}`}>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={files.length >= 2 || loading || uploadedItems.length > 0}
            onChange={handleFileSelection}
          />
          <div className="onboarding-dropzone-inner">
            <div className="onboarding-dropzone-icon">
              {files.length >= 2 ? '✓' : '+'}
            </div>
            <div>
              <p className="onboarding-dropzone-title">
                {files.length >= 2 ? 'Capacity Reached' : `Select Photo ${files.length + 1} of 2`}
              </p>
              <p className="onboarding-dropzone-copy">High-resolution, full-length images preferred.</p>
            </div>
          </div>
        </label>

        {files.length > 0 && (
          <div className="selected-files onboarding-selected-grid">
            {files.map((file, index) => (
              <div key={index} className="selected-file-item fade-in">
                <div className="onboarding-file-meta">
                  <div className="onboarding-file-icon">🖼</div>
                  <span>{file.name}</span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  disabled={loading || uploadedItems.length > 0}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="premium-button-primary onboarding-submit-button"
          onClick={handleUpload}
          disabled={loading || uploadedItems.length > 0 || files.length !== 2}
        >
          {loading ? "Establishing Link..." : uploadedItems.length ? "Files Synchronized" : "Upload References"}
        </button>

        {status && <p className="status-text onboarding-status-text">{status}</p>}
      </div>
    </section>
  );
}

export default ImageUploadStep;
