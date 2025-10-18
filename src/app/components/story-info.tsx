"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
    initialTitle?: string;
    initialLink?: string;
    onChange?: (data: { title: string; link: string }) => void;
};

export function StoryInfo({ initialTitle = "", initialLink = "", onChange }: Props) {
    const [title, setTitle] = useState(initialTitle);
    const [link, setLink] = useState(initialLink);
    const [saved, setSaved] = useState<{ title: string; link: string } | null>(null);
    const [editing, setEditing] = useState(true);

    const emit = (nextTitle: string, nextLink: string) => {
        onChange?.({ title: nextTitle, link: nextLink });
    };

    const handleSave = () => {
        const snapshot = { title: title.trim(), link: link.trim() };
        setSaved(snapshot);
        setEditing(false);
        emit(snapshot.title, snapshot.link);
    };

    const handleEdit = () => {
        if (saved) {
            setTitle(saved.title);
            setLink(saved.link);
        }
        setEditing(true);
    };

    const canSave = title.trim().length > 0 || link.trim().length > 0;

    const openUrl = (raw: string) => {
        const url = /^(https?:)?\/\//i.test(raw) ? raw : raw ? `https://${raw}` : "";
        if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Story</CardTitle>
                    {editing ? (
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    if (saved) {
                                        setTitle(saved.title);
                                        setLink(saved.link);
                                    } else {
                                        setTitle("");
                                        setLink("");
                                    }
                                    setEditing(false);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleSave} disabled={!canSave}>
                                Save
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Button type="button" onClick={handleEdit}>
                                Edit
                            </Button>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {editing ? (
                    <>
                        <div className="space-y-1.5">
                            <label htmlFor="story-title" className="text-sm font-medium">
                                Title
                            </label>
                            <Input
                                id="story-title"
                                placeholder="Type the story title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="story-link" className="text-sm font-medium">
                                Link
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    id="story-link"
                                    placeholder="https://..."
                                    inputMode="url"
                                    value={link}
                                    onChange={(e) => setLink(e.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!link}
                                    onClick={() => openUrl(link)}
                                >
                                    Open
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="space-y-1.5">
                        <div className="text-sm text-muted-foreground">Title</div>
                        <div className="text-base font-medium">
                            {saved?.title || "—"}
                        </div>

                        <div className="text-sm text-muted-foreground mt-3">Link</div>
                        <div className="text-base break-all flex items-center gap-2">
                            <span className="truncate">{saved?.link || "—"}</span>
                            {saved?.link ? (
                                <button
                                    type="button"
                                    aria-label="Open link"
                                    className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    onClick={() => openUrl(saved.link)}
                                >
                                    {/* External link icon (inline SVG to avoid extra deps) */}
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        className="size-4"
                                    >
                                        <path d="M15 3h6v6" />
                                        <path d="M10 14 21 3" />
                                        <path d="M21 14v7H3V3h7" />
                                    </svg>
                                </button>
                            ) : null}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
