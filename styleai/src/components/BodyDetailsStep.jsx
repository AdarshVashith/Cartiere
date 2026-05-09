import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";

const initialForm = {
  name: "",
  age: "",
  gender: "",
  weightKg: "",
  heightCm: "",
  bodyType: "average",
  city: "",
  job: ""
};

function BodyDetailsStep({ user, onComplete }) {
  const [formData, setFormData] = useState(initialForm);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          name: formData.name.trim(),
          age: Number(formData.age),
          gender: formData.gender.trim(),
          weight: Number(formData.weightKg),
          height: Number(formData.heightCm),
          bodyType: formData.bodyType,
          city: formData.city.trim(),
          job: formData.job.trim(),
          onboardingDone: true
        },
        { merge: true }
      );

      setStatus("Details saved. Redirecting...");
      onComplete();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-[40px] shadow-sm border border-[#784854]/05 p-12 max-w-4xl mx-auto fade-in-up">
      <header className="text-center mb-10">
        <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-[#784854]/60 mb-3">Final Calibration</p>
        <h2 className="text-4xl font-['Cormorant_Garamond'] font-bold text-[#1A1A1A] mb-4">Personal Metrics</h2>
        <p className="text-[#666] text-lg font-light max-w-lg mx-auto">
          Our AI uses these details to fine-tune recommendations based on your local climate and lifestyle requirements.
        </p>
      </header>

      <form className="grid grid-cols-2 gap-6" onSubmit={handleSubmit}>
        <div className="form-field">
          <label>Full Name</label>
          <input name="name" placeholder="e.g. Taylor Smith" value={formData.name} onChange={handleChange} required />
        </div>

        <div className="form-field">
          <label>Age</label>
          <input name="age" type="number" min={1} max={120} placeholder="25" value={formData.age} onChange={handleChange} required />
        </div>

        <div className="form-field">
          <label>Gender Presentation</label>
          <input name="gender" placeholder="e.g. Male / Female" value={formData.gender} onChange={handleChange} required />
        </div>

        <div className="form-field">
          <label>Body Architecture</label>
          <select name="bodyType" value={formData.bodyType} onChange={handleChange} className="premium-select">
            <option value="slim">Slim</option>
            <option value="athletic">Athletic</option>
            <option value="average">Average</option>
            <option value="plus">Plus</option>
          </select>
        </div>

        <div className="form-field">
          <label>Height (cm)</label>
          <input name="heightCm" type="number" min={1} placeholder="175" value={formData.heightCm} onChange={handleChange} required />
        </div>

        <div className="form-field">
          <label>Weight (kg)</label>
          <input name="weightKg" type="number" min={1} placeholder="70" value={formData.weightKg} onChange={handleChange} required />
        </div>

        <div className="form-field">
          <label>Current City</label>
          <input name="city" placeholder="e.g. London" value={formData.city} onChange={handleChange} required />
        </div>

        <div className="form-field">
          <label>Occupation</label>
          <input name="job" placeholder="e.g. Designer" value={formData.job} onChange={handleChange} required />
        </div>

        <button type="submit" className="premium-button-primary col-span-2 py-5 rounded-2xl bg-[#1A1A1A] text-white font-bold hover:bg-[#784854] transition-all shadow-xl hover:shadow-[#784854]/20 mt-4" disabled={saving}>
          {saving ? "Finalizing Profile..." : "Complete Enrollment"}
        </button>
      </form>

      {status && <p className="text-center text-sm font-medium text-[#784854]/60 mt-4">{status}</p>}
    </section>
  );
}

export default BodyDetailsStep;
