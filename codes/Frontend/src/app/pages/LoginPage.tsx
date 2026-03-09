import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Card } from '../components/UI';
import { Lock, Mail } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router';

declare global {
  interface Window {
    google?: any;
  }
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { login, loginWithGoogle, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const toothLogoRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!email || !password) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate(result.requiresPasswordChange ? '/settings' : '/');
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  const playToothSwing = () => {
    const el = toothLogoRef.current;
    if (!el || typeof el.animate !== 'function') return;
    el.animate(
      [
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: 'translateY(-2px) rotate(-16deg)' },
        { transform: 'translateY(-1px) rotate(12deg)' },
        { transform: 'translateY(-1px) rotate(-8deg)' },
        { transform: 'translateY(0) rotate(5deg)' },
        { transform: 'translateY(0) rotate(-2deg)' },
        { transform: 'translateY(0) rotate(0deg)' }
      ],
      {
        duration: 860,
        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)'
      }
    );
  };

  useEffect(() => {
    if (!googleClientId) {
      setGoogleLoading(false);
      setGoogleReady(false);
      return;
    }

    let cancelled = false;
    const scriptId = 'google-identity-services-script';

    const initializeGoogle = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          setError('');
          if (!response?.credential) {
            setError('Google sign-in failed. Missing credential.');
            return;
          }

          setIsLoading(true);
          const result = await loginWithGoogle(response.credential);
          setIsLoading(false);

          if (result.success) {
            navigate(result.requiresPasswordChange ? '/settings' : '/');
          } else {
            setError(result.error || 'Google sign-in failed');
          }
        }
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        shape: 'rectangular',
        text: 'signin_with',
        width: 320
      });

      setGoogleReady(true);
      setGoogleLoading(false);
    };

    if (window.google?.accounts?.id) {
      initializeGoogle();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', initializeGoogle);
      existing.addEventListener('error', () => {
        if (!cancelled) {
          setGoogleReady(false);
          setGoogleLoading(false);
        }
      });
      return () => {
        cancelled = true;
        existing.removeEventListener('load', initializeGoogle);
      };
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    script.onerror = () => {
      if (!cancelled) {
        setGoogleReady(false);
        setGoogleLoading(false);
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [googleClientId, loginWithGoogle, navigate]);

  const ToothLogo = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="toothBase" x1="20" y1="18" x2="78" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#EAF4FF" />
          <stop offset="100%" stopColor="#CFE3FF" />
        </linearGradient>
        <radialGradient id="toothCrownGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 28) rotate(90) scale(24 28)">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="toothShadow" x1="62" y1="24" x2="74" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8BB4E8" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#5D8FCF" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <path 
        d="M50 14C46 14 42 15 39 16.5C36.5 17.8 34.8 19.2 33.2 20.8C31.6 22.4 30.1 23.2 28.2 23.3C26.6 23.4 25 24.2 23.8 26C22 28.6 21 31.8 20.8 35.8C20.5 42 22 48.8 24.6 55C27.2 61.1 30.9 66.8 33 73.2C34.8 78.7 35 84.6 37.8 88.9C39.8 92 43 92.7 44.7 90.8C46.8 88.7 47.4 84.2 48.6 76.6C49 74.3 51 74.3 51.4 76.6C52.6 84.2 53.2 88.7 55.3 90.8C57 92.7 60.2 92 62.2 88.9C65 84.6 65.2 78.7 67 73.2C69.1 66.8 72.8 61.1 75.4 55C78 48.8 79.5 42 79.2 35.8C79 31.8 78 28.6 76.2 26C75 24.2 73.4 23.4 71.8 23.3C69.9 23.2 68.4 22.4 66.8 20.8C65.2 19.2 63.5 17.8 61 16.5C58 15 54 14 50 14Z" 
        fill="url(#toothBase)"
      />
      <path
        d="M64 20C68 23 71 30 71 40C71 50 68 61 64 71C62 76 61 82 60 87C61 88 62 88 62 88C65 84 65 79 67 74C69 68 73 62 76 55C80 46 81 36 77 28C75 24 73 21 69 18C67 17 65 16 64 16V20Z"
        fill="url(#toothShadow)"
      />
      <path
        d="M30 26.8C33.2 23.2 39.6 20.4 46 20.8C47.8 20.9 49 21.5 50 22.2C51 21.5 52.2 20.9 54 20.8C60.4 20.4 66.8 23.2 70 26.8"
        stroke="#FFFFFF"
        strokeOpacity="0.65"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <ellipse cx="50" cy="28" rx="18" ry="14" fill="url(#toothCrownGlow)" />
      <path d="M40 30L39 38" stroke="#BFD6F3" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M47 29L46 39" stroke="#BFD6F3" strokeOpacity="0.5" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M54 29L54 40" stroke="#BFD6F3" strokeOpacity="0.45" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M61 30L62 39" stroke="#BFD6F3" strokeOpacity="0.4" strokeWidth="1.1" strokeLinecap="round" />
      <ellipse cx="50" cy="21.5" rx="3.1" ry="1.95" fill="#6B7686" fillOpacity="0.42" />
      <ellipse cx="50.5" cy="21.2" rx="1.75" ry="1.05" fill="#2E3744" fillOpacity="0.34" />
      <path d="M48.2 20.9C48.9 20.2 49.9 19.9 51 20.1" stroke="#A7B0BC" strokeOpacity="0.35" strokeWidth="0.7" strokeLinecap="round" />
      <path 
        d="M39 32C39 30 41 28 44 28C47 28 49 30 49 32C49 34 47 36 44 36C41 36 39 34 39 32Z" 
        fill="white" 
        fillOpacity="0.2"
      />
      <path 
        d="M50 21C40 21 31 28 29 39" 
        stroke="white" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeOpacity="0.28"
      />
    </svg>
  );

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(155%_105%_at_15%_0%,#fbfdff_0%,#e6f1ff_32%,#c7ddff_76%,#d1d3ff_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(76,160,255,0.3)_0%,rgba(76,160,255,0.12)_45%,rgba(95,118,238,0.3)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(52%_42%_at_50%_46%,rgba(86,170,255,0.56)_0%,rgba(86,170,255,0.3)_48%,rgba(86,170,255,0)_80%)]" />

        <div className="absolute -top-28 -left-24 w-[36rem] h-[36rem] rounded-full bg-white/55 blur-[110px]" />
        <div className="absolute -top-24 -left-16 w-[28rem] h-[28rem] rounded-full bg-violet-200/36 blur-[100px]" />
        <div className="absolute top-[-5%] right-[-10%] w-[34rem] h-[34rem] rounded-full bg-blue-300/72 blur-[120px]" />
        <div className="absolute bottom-[-14%] left-[24%] w-[40rem] h-[24rem] rounded-full bg-cyan-200/64 blur-[110px]" />
        <div className="absolute bottom-[8%] right-[8%] w-[24rem] h-[24rem] rounded-full bg-violet-200/44 blur-[100px]" />

      </div>

      {/* Centered Login Portal Card */}
      <Card className="relative z-10 w-full max-w-md p-8 rounded-[28px] shadow-2xl bg-white/95 backdrop-blur-sm animate-in fade-in zoom-in duration-500">
        <div className="pointer-events-none absolute inset-0 rounded-[28px] border-2 border-blue-600" />
        <div className="text-center mb-8">
          {/* Tooth Logo - Centered in Card */}
          <div className="flex justify-center mb-6">
            <div
              ref={toothLogoRef}
              className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl cursor-pointer transform-gpu transition-transform duration-300 hover:-translate-y-1.5 hover:scale-[1.06] active:scale-[0.97]"
              onClick={playToothSwing}
              title="Click to swing"
            >
              <ToothLogo className="w-14 h-14" />
            </div>
          </div>
          
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">OrthoFlow</h1>
          <p className="text-gray-500 mt-2 font-medium">University Dental Hospital Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                className="pl-10 h-12 border-gray-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <Input
                type="password"
                className="pl-10 h-12 border-gray-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-100 text-xs text-red-600 font-bold">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-12 text-base font-bold shadow-lg hover:shadow-xl transition-all bg-blue-600 hover:bg-blue-700" disabled={isLoading || authLoading}>
            {isLoading || authLoading ? 'Signing In...' : 'Sign In to Portal'}
          </Button>

          <div className="pt-2">
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400 tracking-wider">or</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              {googleClientId ? (
                <>
                  <div ref={googleButtonRef} className="min-h-10" aria-label="Sign in with Google button container" />
                  {googleLoading && <p className="text-xs text-gray-500">Loading Google sign-in...</p>}
                  {!googleLoading && !googleReady && (
                    <p className="text-xs text-red-600">Google sign-in unavailable. Please use email/password.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-500">Google sign-in is not configured for this environment.</p>
              )}
              {!googleReady && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-11 max-w-[320px]"
                  onClick={() => {
                    if (!googleClientId) {
                      setError('Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID.');
                      return;
                    }
                    setError('Google sign-in is currently unavailable. Please try again.');
                  }}
                >
                  Sign in with Google
                </Button>
              )}
            </div>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-2">
            Authorized Personnel Only
          </p>
          <p className="text-[10px] text-gray-400 leading-relaxed max-w-[280px] mx-auto">
            Secure clinical gateway. By logging in, you agree to HIPAA compliance protocols.
          </p>
        </div>
      </Card>
    </div>
  );
}
