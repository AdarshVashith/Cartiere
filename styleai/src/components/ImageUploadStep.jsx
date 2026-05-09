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
    <section className="bg-white rounded-[40px] shadow-sm border border-[#784854]/05 p-12 max-w-4xl mx-auto fade-in-up">
      <header className="text-center mb-10">
        <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-[#784854]/60 mb-3">Geometric reference</p>
        <h2 className="text-4xl font-['Cormorant_Garamond'] font-bold text-[#1A1A1A] mb-4">Body Mapping</h2>
        <p className="text-[#666] text-lg font-light max-w-lg mx-auto">
          Upload clear full-body photos. These references allow our AI to tailor garment fits precisely to your silhouette.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Baseline Tone', value: faceScanResult?.skinTone },
          { label: 'Geometry', value: faceScanResult?.faceShape },
          { label: 'Biometrics', value: faceScanResult?.dominantExpression }
        ].map((stat, i) => (
          <div key={i} className="bg-[#fcf6f7] rounded-2xl p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#784854]/40 mb-1">{stat.label}</p>
            <p className="font-bold text-[#784854] text-xs capitalize">{stat.value || 'Verified'}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        <label className={`relative group cursor-pointer border-2 border-dashed rounded-[32px] p-12 transition-all ${files.length >= 2 ? 'border-[#784854]/10 bg-[#fcf6f7]/50' : 'border-[#784854]/20 hover:border-[#784854] hover:bg-[#fcf6f7]'}`}>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={files.length >= 2 || loading || uploadedItems.length > 0}
            onChange={handleFileSelection}
          />
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-2xl shadow-sm text-[#784854]">
              {files.length >= 2 ? '✓' : '+'}
            </div>
            <div>
              <p className="font-bold text-[#1A1A1A]">
                {files.length >= 2 ? 'Capacity Reached' : `Select Photo ${files.length + 1} of 2`}
              </p>
              <p className="text-[#666] text-sm mt-1">High-resolution portraits preferred.</p>
            </div>
          </div>
        </label>

        {files.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {files.map((file, index) => (
              <div key={index} className="bg-white rounded-2xl p-4 border border-[#784854]/10 flex items-center justify-between shadow-sm fade-in">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-[#fcf6f7] flex items-center justify-center text-[#784854]">🖼</div>
                  <p className="text-sm font-medium text-[#1A1A1A] truncate">{file.name}</p>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  disabled={loading || uploadedItems.length > 0}
                  className="text-[#e74c3c] text-xs font-bold hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="premium-button-primary w-full py-5 rounded-2xl bg-[#1A1A1A] text-white font-bold hover:bg-[#784854] transition-all shadow-xl hover:shadow-[#784854]/20 mt-4"
          onClick={handleUpload}
          disabled={loading || uploadedItems.length > 0 || files.length !== 2}
        >
          {loading ? "Establishing Link..." : uploadedItems.length ? "Files Synchronized" : "Upload References"}
        </button>

        {status && <p className="text-center text-sm font-medium text-[#784854]/60">{status}</p>}
      </div>
    </section>
  );
}

export default ImageUploadStep;
