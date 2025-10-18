"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { StoryInfo } from "@/app/components/story-info";

const CARDS = ["0.5", "1", "2", "3", "5", "8", "13", "20", "40", "?", "☕"];

type Participant = {
    id: string;
    name: string;
    vote?: string | null;
};

export default function GameRoomPage() {
    const params = useParams<{ room: string }>();
    const search = useSearchParams();

    const room = (params?.room || "").toString().toUpperCase();
    const name = (search?.get("name") || "Guest").toString();

    const [selection, setSelection] = useState<string | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([
        { id: "me", name, vote: null },
        { id: "u2", name: "Alex", vote: null },
        { id: "u3", name: "Sam", vote: null },
        { id: "u4", name: "Taylor", vote: null },
    ]);

    const votedCount = participants.filter((p) => p.vote != null).length;

    const results = useMemo(() => {
        if (!revealed) return null;
        const counts = new Map<string, number>();
        for (const p of participants) {
            const v = p.vote ?? "—";
            counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        const entries = Array.from(counts.entries()).sort((a, b) => {
            const na = Number(a[0]), nb = Number(b[0]);
            const aNum = !Number.isNaN(na), bNum = !Number.isNaN(nb);
            if (aNum && bNum) return na - nb;
            if (aNum) return -1;
            if (bNum) return 1;
            return a[0].localeCompare(b[0]);
        });
        const numericVotes = participants
            .map((p) =>
                p.vote && !Number.isNaN(Number(p.vote)) ? Number(p.vote) : null,
            )
            .filter((v): v is number => v !== null);
        const avg =
            numericVotes.length > 0
                ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(2)
                : null;
        return { entries, avg };
    }, [participants, revealed]);

    const handleReveal = () => {
        if (!selection) return;
        setParticipants((prev) =>
            prev.map((p) => (p.id === "me" ? { ...p, vote: selection } : p)),
        );
        setRevealed(true);
    };

    const handleReset = () => {
        setSelection(null);
        setRevealed(false);
        setParticipants((prev) => prev.map((p) => ({ ...p, vote: null })));
    };

    const copyGameUrl = async () => {
        const url =
            typeof window !== "undefined"
                ? `${location.origin}/game/${encodeURIComponent(room)}}`
                : "";
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <main className="flex-1 px-6">
                <div className="w-full max-w-7xl mx-auto py-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-3">
                            <StoryInfo onChange={() => {}} />
                        </div>
                    </div>
                </div>

                <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <CardTitle>Planning Poker</CardTitle>
                                        <CardDescription>
                                            Room {room} • {name ? `Welcome, ${name}.` : ""}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={copyGameUrl}
                                            title="Copy room link"
                                        >
                                            Copy room link
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            onClick={handleReset}
                                            title="Reset game"
                                            disabled={!revealed && !selection}
                                        >
                                            Reset game
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-5 gap-4">
                                    {CARDS.map((c) => (
                                        <Button
                                            key={c}
                                            variant={selection === c ? "default" : "outline"}
                                            onClick={() => setSelection(c)}
                                            className={`py-8 text-xl transition-all ${
                                                revealed
                                                    ? selection === c
                                                        ? "ring-2 ring-primary"
                                                        : "opacity-40"
                                                    : ""
                                            }`}
                                        >
                                            {c === "☕" ? (
                                                <span className="text-3xl leading-none">☕</span>
                                            ) : revealed ? (selection === c ? c : "—") : c}
                                        </Button>
                                    ))}
                                </div>

                                <div className="mt-6 flex justify-end">
                                    <Button
                                        variant="outline"
                                        onClick={handleReset}
                                        disabled={!selection && !revealed}
                                    >
                                        Clear choice
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-1 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Participants</CardTitle>
                                <CardDescription>
                                    {votedCount}/{participants.length} ready
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3">
                                    {participants.map((p) => (
                                        <li
                                            key={p.id}
                                            className="flex items-center justify-between rounded-md border px-3 py-2"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={`size-2.5 rounded-full ${
                                                        p.vote ? "bg-green-500" : "bg-zinc-500"
                                                    }`}
                                                />
                                                <span className={p.id === "me" ? "font-medium" : ""}>
                          {p.name} {p.id === "me" ? "(you)" : ""}
                        </span>
                                            </div>
                                            <span className="text-sm text-muted-foreground">
                        {revealed ? (p.vote ?? "—") : p.vote ? "voted" : "waiting"}
                      </span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <CardTitle>Results</CardTitle>
                                        <CardDescription>
                                            {revealed ? "Votes distribution" : "Reveal to see results"}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" onClick={handleReveal} disabled={!selection || revealed}>
                                            Reveal
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {!revealed ? (
                                    <div className="text-sm text-muted-foreground">No results yet.</div>
                                ) : (
                                    <div className="space-y-4">
                                        <ul className="space-y-2">
                                            {results?.entries.map(([value, count]) => (
                                                <li key={value} className="flex items-center justify-between">
                                                    <span className="font-mono">{value}</span>
                                                    <span className="text-muted-foreground">{count}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {results?.avg && (
                                            <div className="text-sm">
                                                Average (numbers only): <span className="font-semibold">{results.avg}</span>
                                            </div>
                                        )}
                                        <div className="pt-2 border-t">
                                            <ul className="mt-2 space-y-1">
                                                {participants.map((p) => (
                                                    <li key={p.id} className="flex justify-between text-sm">
                                                        <span>{p.name}</span>
                                                        <span className="font-mono">{p.vote ?? "—"}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
