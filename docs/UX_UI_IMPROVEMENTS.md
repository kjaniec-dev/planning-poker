# UX and UI Improvements for Planning Poker

This document outlines proposed UX and UI improvements to enhance the user experience and interface of the Planning Poker application.

## UX (User Experience) Improvements

### 1. Persistent Identity [COMPLETED]
*   **Problem:** Users have to enter their name every time they join or create a room.
*   **Improvement:** Store the user's name in `localStorage` after the first entry. Sync name between URL and `localStorage`.
*   **Impact:** Reduces friction for returning users and ensures consistent identity across sessions.
*   **Implementation:** Handled in `LandingPage` and `GameRoomPage`. Automatically retrieves saved name and updates URL if missing.

### 2. Auto-Reveal Strategy [COMPLETED]
*   **Problem:** Manually revealing cards can be a bottleneck.
*   **Improvement:** Add a room setting to "Auto-reveal when everyone has voted".
*   **Impact:** Speeds up the estimation process.
*   **Implementation:** Added `autoReveal` to room state on server. New `toggle-auto-reveal` message. Logic in `handleVote` to trigger reveal when all active participants have voted if `autoReveal` is enabled. UI toggle added to `GameRoomPage`.

### 3. Discussion Timer
*   **Problem:** Teams often spend too much time discussing a single story.
*   **Improvement:** Implement a simple countdown timer that can be started by any participant.
*   **Impact:** Helps keep meetings on schedule.

### 4. Estimation History
*   **Problem:** Teams lose track of what they estimated earlier in the session.
*   **Improvement:** Add a "Session History" sidebar showing the story title and final estimate for previous rounds.
*   **Impact:** Provides valuable context for current estimations.

---

## UI (User Interface) Improvements

### 1. Interactive Card Animations
*   **Improvement:** Use 3D flip animations when cards are revealed. Add "wiggle" animations when a user changes their vote.
*   **Impact:** Makes the interface feel more dynamic and "game-like".

### 2. Dynamic Avatars
*   **Improvement:** Before text names in the participant list add circular avatars containing initials. Like the greyscale so keep it rather greyscale. Be careful of theme colors
*   **Impact:** Improves visual recognition of team members at a glance.

### 3. Visual Progress Tracking
*   **Improvement:** Replace the "3/5 ready" text with a circular or linear progress bar. Not replace maybe keep it both?
*   **Impact:** Provides a more intuitive sense of how close the group is to revealing.

### 4. Refined Card Design
*   **Improvement:** Give voting cards a more "tactile" feel with subtle gradients, border-radius, and depth shadows. Add a "raised" state on hover.
*   **Impact:** Enhances the premium feel of the application.

### 5. Haptic Feedback (Mobile)
*   **Improvement:** Trigger a short vibration when a user taps a card on mobile devices.
*   **Impact:** Provides physical confirmation of an action.

### 6. Skeleton Loaders
*   **Improvement:** Use skeleton screens while connecting to the WebSocket server instead of a blank state or simple spinner.
*   **Impact:** Makes the application feel faster and more stable during initial load.

