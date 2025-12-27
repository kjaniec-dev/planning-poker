"use client";

import { Edit, ExternalLink, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Story = { title: string; link: string } | null;

type Props = {
  value?: Story;
  onChange?: (story: Story) => void;
};

export function StoryInfo({ value, onChange }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    setTitle(value?.title ?? "");
    setLink(value?.link ?? "");
  }, [value?.title, value?.link]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    const story: Story = title || link ? { title, link: link } : null;
    onChange?.(story);
    setTitle(story?.title ?? "");
    setLink(story?.link ?? "");
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTitle(value?.title ?? "");
    setLink(value?.link ?? "");
    setIsEditing(false);
  };

  const isValidUrl = (url: string): boolean => {
    if (!url) return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>User Story</CardTitle>
          <div className="flex gap-2 sm:flex-row">
            {!isEditing && link && isValidUrl(link) && (
              <Button
                variant="default"
                size="sm"
                onClick={() => window.open(link, "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
                Open Link
              </Button>
            )}
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="story-title">Title</Label>
          {isEditing ? (
            <Input
              id="story-title"
              placeholder="Enter story title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          ) : (
            <div className="h-9 px-3 py-1 border rounded-md bg-muted/30 flex items-center text-base md:text-sm">
              {title || (
                <span className="text-muted-foreground">No title set</span>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="story-description">Link</Label>
          {isEditing ? (
            <Input
              id="story-description"
              placeholder="Enter the link to your story..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          ) : (
            <div className="h-9 px-3 py-1 border rounded-md bg-muted/30 flex items-center whitespace-pre-wrap text-base md:text-sm">
              {link || (
                <span className="text-muted-foreground">No link set</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
