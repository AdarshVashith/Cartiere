import { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { auth } from "../firebase/firebase";

const initialForm = {
  name: "",
  email: "",
  password: ""
};

function AuthCard({ onAuthenticated }) {
  const [mode, setMode] = useState("signup");
  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState({ score: 0, label: "" });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));

    if (name === "password") {
      calculateStrength(value);
    }
  };

  const calculateStrength = (pass) => {
    if (!pass) {
      setStrength({ score: 0, label: "" });
      return;
    }
    let score = 0;
    if (pass.length >= 6) score = 1;
    if (pass.length >= 8) score = 2;
    if (pass.length >= 10 && /[A-Z]/.test(pass)) score = 3;
    if (pass.length >= 12 && /[^a-zA-Z0-9]/.test(pass)) score = 4;

    const labels = ["", "Weak", "Fair", "Good", "Strong"];
    setStrength({ score, label: labels[score] });
  };

  const getStrengthColor = () => {
    const colors = ["#eee", "#e74c3c", "#f39c12", "#27ae60", "#085E55"];
    return colors[strength.score];
  };

  useEffect(() => {
    setError("");
    setShowPassword(false);
  }, [mode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "signup") {
        const result = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );

        if (formData.name.trim()) {
          await updateProfile(result.user, {
            displayName: formData.name.trim()
          });
        }

        onAuthenticated(result.user);
      } else {
        const result = await signInWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        onAuthenticated(result.user);
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  return (
    <div className="auth-content">
      <h1 className="auth-heading">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="auth-subtext">
        {mode === "signup" 
          ? "Build your AI-powered wardrobe profile and unlock sharper outfit suggestions." 
          : "Log in to continue with your personal style dashboard and saved wardrobe."}
      </p>

      <div className="auth-toggle-pill">
        <button 
          className={`auth-toggle-btn ${mode === "signup" ? "active" : ""}`}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
        <button 
          className={`auth-toggle-btn ${mode === "login" ? "active" : ""}`}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "signup" && (
          <div className="form-field">
            <label>Full name</label>
            <input 
              name="name"
              type="text" 
              placeholder="e.g. Taylor Smith" 
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>
        )}

        <div className="form-field">
          <label>Email address</label>
          <input 
            name="email"
            type="email" 
            placeholder="you@example.com" 
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-field">
          <label>Password</label>
          <div className="password-field-wrap">
            <input 
              name="password"
              type={showPassword ? "text" : "password"} 
              placeholder="Minimum 6 characters" 
              value={formData.password}
              onChange={handleChange}
              minLength={6}
              required
              className="password-input"
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="password-toggle-btn"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {mode === "signup" && strength.score > 0 && (
          <div className="password-strength">
            <div className="password-strength-bars" aria-hidden="true">
              {[1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  className={`password-strength-bar ${strength.score >= level ? "active" : ""}`}
                  style={{ backgroundColor: strength.score >= level ? getStrengthColor() : undefined }}
                />
              ))}
            </div>
            <span className="password-strength-label">{strength.label} password</span>
          </div>
        )}

        {error && <p className="error-text-premium">{error}</p>}

        <button type="submit" className="auth-submit-btn" disabled={loading}>
          {loading ? "Authenticating..." : (mode === "signup" ? "Create Account" : "Sign In")}
        </button>
      </form>

      <div className="auth-divider">OR</div>

      <button className="google-btn" onClick={handleGoogleSignIn} disabled={loading}>
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84c-.21 1.12-.84 2.07-1.8 2.73v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.64z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.3C2.43 15.89 5.5 18 9 18z"/>
          <path fill="#FBBC05" d="M3.97 10.72c-.18-.54-.28-1.12-.28-1.72s.1-1.18.28-1.72V5l-3.02-2.33C.38 3.93 0 5.42 0 7c0 1.58.38 3.07 1.05 4.33l3.02-2.33z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.35C13.47.9 11.43 0 9 0 5.5 0 2.43 2.11.95 5.11l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
        </svg>
        Sign in with Google
      </button>

      <div className="auth-footer-link">
        {mode === "signup" ? (
          <>Already have an account? <span onClick={() => setMode("login")}>Sign in</span></>
        ) : (
          <>Don't have an account? <span onClick={() => setMode("signup")}>Sign up</span></>
        )}
      </div>
    </div>
  );
}

export default AuthCard;
