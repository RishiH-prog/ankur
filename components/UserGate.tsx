"use client";

import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UserGateProps {
  onSuccess: (username: string) => void;
}

export function UserGate({ onSuccess }: UserGateProps) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0..1
    const y = (e.clientY - rect.top) / rect.height; // 0..1
    const rotateX = (y - 0.5) * -12; // tilt up/down
    const rotateY = (x - 0.5) * 12; // tilt left/right
    setTilt({ x: rotateX, y: rotateY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim()) {
      toast.error("Enter password");
      return;
    }
    if (password !== "indore") {
      toast.error("Incorrect password");
      return;
    }
    setSubmitting(true);
    try {
      onSuccess("Guest");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Agritech gradient sky */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-500 via-emerald-400 to-emerald-900" />

      {/* Animated sun */}
      <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-amber-300 blur-3xl opacity-70 animate-pulse" />

      {/* Rolling hills layers (parallax) */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full opacity-80" viewBox="0 0 1440 400" preserveAspectRatio="none">
        <path d="M0,320 C200,260 400,340 720,300 C980,260 1200,340 1440,300 L1440,400 L0,400Z" fill="#14532d" opacity="0.35" />
        <path d="M0,340 C220,280 480,360 760,320 C1040,280 1280,360 1440,320 L1440,400 L0,400Z" fill="#166534" opacity="0.45" />
        <path d="M0,360 C260,300 520,380 840,340 C1120,300 1440,380 1440,360 L1440,400 L0,400Z" fill="#15803d" opacity="0.65" />
      </svg>

      {/* Floating leaves (decor) */}
      <div className="pointer-events-none absolute right-12 top-24 text-5xl opacity-60 animate-bounce">🍃</div>
      <div className="pointer-events-none absolute left-10 bottom-24 text-4xl opacity-60 animate-bounce [animation-delay:200ms]">🌿</div>
      <div className="pointer-events-none absolute right-1/3 bottom-8 text-6xl opacity-40 animate-bounce [animation-delay:400ms]">🌾</div>

      {/* Centered tilt card */}
      <div className="relative z-10 flex h-full w-full items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={cn(
              "transition-transform duration-150 will-change-transform"
            )}
            style={{ transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
          >
            <Card className="backdrop-blur-xl bg-white/10 border-white/20 shadow-2xl ring-1 ring-white/10">
              <CardHeader>
                <CardTitle className="text-white text-2xl tracking-tight">Enter the Field</CardTitle>
                <CardDescription className="text-emerald-100/90">
                  Secure Access • Password required
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="user-password" className="text-sm font-medium text-white/90">Password</label>
                  <Input
                    id="user-password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    disabled={submitting}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/60 focus-visible:ring-emerald-300"
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/30" disabled={submitting}>
                  {submitting ? "Entering…" : "Enter Farm"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </form>
      </div>

      {/* Subtle moving grain lines (3D-ish parallax) */}
      <div className="pointer-events-none absolute inset-0 opacity-10 [background:repeating-linear-gradient(135deg,rgba(255,255,255,0.15)_0px,rgba(255,255,255,0.15)_2px,transparent_2px,transparent_6px)] animate-pulse" />
    </div>
  );
}
