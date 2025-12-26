"use client";

import { Ban, Check, Loader } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

type Participant = {
	id: string;
	name: string;
	vote: string | null;
	paused?: boolean;
};

type Props = {
	participants: Participant[];
};

export function Participants({ participants }: Props) {
	const votingParticipants = participants.filter(
		(p) => p.name !== "Guest" && !p.paused,
	);
	const votedCount = votingParticipants.filter((p) => p.vote != null).length;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Participants</CardTitle>
				<CardDescription>
					{votedCount}/{votingParticipants.length} ready
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
								<span>{p.name}</span>
								{p.paused && (
									<span className="ml-2 text-xs px-2 py-0.5 rounded bg-muted-foreground text-muted">
										Paused
									</span>
								)}
							</div>
							<div
								className="text-muted-foreground"
								title={
									p.name === "Guest"
										? "Spectator"
										: p.vote
											? "Voted"
											: "Voting..."
								}
							>
								{p.name === "Guest" ? (
									<Ban className="h-4 w-4" />
								) : p.vote ? (
									<Check className="h-4 w-4" />
								) : (
									<Loader className="h-4 w-4 animate-pulse" />
								)}
							</div>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
