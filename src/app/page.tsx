"use client";

import { FormField } from "@kjaniec-dev/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedName = localStorage.getItem("planning-poker-user-name");
    if (savedName) {
      setName(savedName);
    }
  }, []);

  if (!mounted) return null;

  const generateRoomCode = (length = 8) =>
    Array.from({ length })
      .map(() =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(
          Math.floor(Math.random() * 36),
        ),
      )
      .join("");

  const handleSubmit = (isCreating: boolean) => {
    if (!name || (!isCreating && !roomCode)) return;

    localStorage.setItem("planning-poker-user-name", name.trim());
    const room = (isCreating ? generateRoomCode() : roomCode).toUpperCase();
    const qp = new URLSearchParams();
    qp.set("name", name);
    router.push(`/game/${encodeURIComponent(room)}?${qp.toString()}`);
  };

  return (
    <div className="relative w-full py-12 md:py-20 bg-canvas overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-[420px] w-[420px] rounded-full bg-secondary/20 blur-3xl"
      />
      <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-24 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-kj-2xl border border-border/80 bg-surface/60 backdrop-blur px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_var(--kj-primary)]" />
            Real-time planning poker
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
            Estimate <span className="text-primary">together,</span>
            <br />
            ship with <span className="text-secondary">confidence.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl">
            A premium estimation room for agile teams. Live voting, instant
            reveal, story-by-story flow — no signup, no friction.
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Fibonacci 0 – 40", tone: "secondary" as const },
              { label: "Sub-second sync", tone: "primary" as const },
              { label: "No account", tone: "neutral" as const },
            ].map((chip) => (
              <Badge key={chip.label} variant={chip.tone} dot>
                {chip.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-px rounded-kj-2xl bg-gradient-to-br from-primary/40 via-transparent to-secondary/30 opacity-50 blur-md"
          />
          <Card className="relative shadow-kj-lg">
            <CardHeader className="border-b border-border/60 pb-5">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-secondary/70" />
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  planning-poker · room
                </span>
              </div>
              <CardTitle className="text-2xl">Get started</CardTitle>
              <CardDescription>
                Create a new room or join an existing one
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Tabs defaultValue="create" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="create">Create</TabsTrigger>
                  <TabsTrigger value="join">Join</TabsTrigger>
                </TabsList>

                <TabsContent value="create" className="space-y-4 mt-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSubmit(true);
                    }}
                  >
                    <FormField label="Your Name">
                      <Input
                        id="name-create"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </FormField>
                    <Button
                      className="w-full mt-4 hover:shadow-kj-glow"
                      type="submit"
                      size="lg"
                      disabled={!name}
                    >
                      Create Room →
                    </Button>
                  </form>
                  <p className="text-sm text-muted-foreground text-center">
                    Create a new room and share the code with your team
                  </p>
                </TabsContent>

                <TabsContent value="join" className="space-y-4 mt-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSubmit(false);
                    }}
                  >
                    <FormField label="Your Name">
                      <Input
                        id="name-join"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </FormField>
                    <FormField
                      label="Room Code"
                      hint="8‑character code, e.g. AB12CD34"
                    >
                      <Input
                        id="room-code"
                        placeholder="Enter room code"
                        value={roomCode}
                        onChange={(e) =>
                          setRoomCode(e.target.value.toUpperCase())
                        }
                        className="uppercase"
                        maxLength={8}
                      />
                    </FormField>
                    <Button
                      className="w-full mt-4 hover:shadow-kj-glow"
                      type="submit"
                      size="lg"
                      disabled={!name || !roomCode}
                    >
                      Join Room →
                    </Button>
                  </form>
                  <p className="text-sm text-muted-foreground text-center">
                    Enter the code provided by your team lead
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
