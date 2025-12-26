"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LandingPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [roomCode, setRoomCode] = useState("");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
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

		const room = (isCreating ? generateRoomCode() : roomCode).toUpperCase();
		const qp = new URLSearchParams();
		qp.set("name", name);
		router.push(`/game/${encodeURIComponent(room)}?${qp.toString()}`);
	};

	return (
		<div className="min-h-screen bg-background flex flex-col">
			<div className="flex-1 flex items-center justify-center px-6 py-12">
				<div className="w-full max-w-md space-y-8">
					<div className="space-y-3 text-center">
						<h2 className="text-4xl font-bold tracking-tight">
							Estimate Together
						</h2>
						<p className="text-lg text-muted-foreground">
							Real-time planning poker for agile teams
						</p>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Get Started</CardTitle>
							<CardDescription>
								Create a new room or join an existing one
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Tabs defaultValue="create" className="w-full">
								<TabsList className="grid w-full grid-cols-2 bg-muted rounded-md">
									<TabsTrigger
										value="create"
										className="data-[state=active]:bg-background data-[state=active]:text-foreground"
									>
										Create
									</TabsTrigger>
									<TabsTrigger
										value="join"
										className="data-[state=active]:bg-background data-[state=active]:text-foreground"
									>
										Join
									</TabsTrigger>
								</TabsList>

								<TabsContent value="create" className="space-y-4 mt-4">
									<form
										onSubmit={(e) => {
											e.preventDefault();
											handleSubmit(true);
										}}
									>
										<div className="space-y-2">
											<Label htmlFor="name-create">Your Name</Label>
											<Input
												id="name-create"
												placeholder="Enter your name"
												value={name}
												onChange={(e) => setName(e.target.value)}
											/>
										</div>
										<Button
											className="w-full mt-2"
											type="submit"
											disabled={!name}
										>
											Create Room
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
										<div className="space-y-2">
											<Label htmlFor="name-join">Your Name</Label>
											<Input
												id="name-join"
												placeholder="Enter your name"
												value={name}
												onChange={(e) => setName(e.target.value)}
											/>
										</div>
										<div className="space-y-2 mt-2">
											<Label htmlFor="room-code">Room Code</Label>
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
											<p className="text-xs text-muted-foreground">
												8‑character code, e.g.{" "}
												<span className="font-mono">AB12CD34</span>
											</p>
										</div>
										<Button
											className="w-full mt-2"
											type="submit"
											disabled={!name || !roomCode}
										>
											Join Room
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
