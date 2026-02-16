"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORY_PANELS = [
  "/assets/storyline/pt1.png",
  "/assets/storyline/pt2.png",
  "/assets/storyline/pt3.png",
  "/assets/storyline/pt4.png",
  "/assets/storyline/pt5.png",
  "/assets/storyline/pt6.png",
  "/assets/storyline/pt7.png"
] as const;

type StoryOverlayProps = {
  onBegin: () => void;
  onSkip: () => void;
};

export function StoryOverlay({ onBegin, onSkip }: StoryOverlayProps) {
  const [panel, setPanel] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [firstPanelReady, setFirstPanelReady] = useState(false);
  const pageFlipAudioRef = useRef<HTMLAudioElement | null>(null);
  const beginAudioRef = useRef<HTMLAudioElement | null>(null);
  const storyMusicRef = useRef<HTMLAudioElement | null>(null);

  const playPageFlipSfx = useCallback(() => {
    const audio = pageFlipAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // no-op when autoplay policies block audio
    });
  }, []);

  const playBeginSfx = useCallback(() => {
    const audio = beginAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // no-op when autoplay policies block audio
    });
  }, []);

  const ensureStoryMusic = useCallback(() => {
    const music = storyMusicRef.current;
    if (!music) return;
    void music.play().catch(() => {
      // Autoplay may be blocked until user interaction.
    });
  }, []);

  useEffect(() => {
    const preloaders: HTMLImageElement[] = [];
    for (const src of STORY_PANELS) {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      preloaders.push(img);
    }

    const first = preloaders[0];
    if (first.complete) {
      setFirstPanelReady(true);
    } else {
      const onReady = () => setFirstPanelReady(true);
      first.addEventListener("load", onReady, { once: true });
      first.addEventListener("error", onReady, { once: true });
    }

    const pageFlipAudio = new Audio("/sounds/page-turn.mp3");
    pageFlipAudio.preload = "auto";
    pageFlipAudio.volume = 0.32;
    pageFlipAudioRef.current = pageFlipAudio;

    const beginAudio = new Audio("/sounds/gamestart.mp3");
    beginAudio.preload = "auto";
    beginAudio.volume = 0.45;
    beginAudioRef.current = beginAudio;

    const storyMusic = new Audio("/sounds/soundtrack1.mp3");
    storyMusic.preload = "auto";
    storyMusic.loop = true;
    storyMusic.volume = 0.14;
    storyMusicRef.current = storyMusic;
    void storyMusic.play().catch(() => {
      // Autoplay may be blocked until user interaction.
    });

    return () => {
      if (pageFlipAudioRef.current) {
        pageFlipAudioRef.current.pause();
        pageFlipAudioRef.current.src = "";
      }
      if (beginAudioRef.current) {
        beginAudioRef.current.pause();
        beginAudioRef.current.src = "";
      }
      if (storyMusicRef.current) {
        storyMusicRef.current.pause();
        storyMusicRef.current.src = "";
      }
    };
  }, []);

  const goToPanel = useCallback((next: number) => {
    if (transitioning) return;
    const target = Math.max(0, Math.min(STORY_PANELS.length - 1, next));
    if (target === panel) return;

    setTransitioning(true);
    setPanel(target);
    window.setTimeout(() => setTransitioning(false), 320);
  }, [panel, transitioning]);

  const onOverlayTap = useCallback(() => {
    if (panel >= STORY_PANELS.length - 1) return;
    ensureStoryMusic();
    playPageFlipSfx();
    goToPanel(panel + 1);
  }, [ensureStoryMusic, goToPanel, panel, playPageFlipSfx]);

  const isFinal = panel === STORY_PANELS.length - 1;

  return (
    <div
      className={"story-overlay" + (isFinal ? "" : " cursor-pointer")}
      onClick={onOverlayTap}
      role="presentation"
    >
      <button
        type="button"
        className="story-skip"
        onClick={(e) => {
          e.stopPropagation();
          ensureStoryMusic();
          playPageFlipSfx();
          onSkip();
        }}
      >
        Skip &gt;
      </button>

      <div className="story-stage">
        <div className="story-image-shell">
          {!firstPanelReady ? (
            <div className="story-loading">Loading story...</div>
          ) : null}
          <AnimatePresence mode="wait">
            <motion.div
              key={panel}
              className="story-motion-wrap"
              initial={{ opacity: 0, rotateY: -72, x: 36, scale: 0.98 }}
              animate={{ opacity: 1, rotateY: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, rotateY: 72, x: -36, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <img
                src={STORY_PANELS[panel]}
                alt={`Story panel ${panel + 1}`}
                className="story-image is-visible"
                draggable={false}
                loading={panel === 0 ? "eager" : "lazy"}
                fetchPriority={panel === 0 ? "high" : "auto"}
                decoding="async"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {isFinal && (
          <button
            type="button"
            className="story-begin-btn"
            onClick={(e) => {
              e.stopPropagation();
              ensureStoryMusic();
              playBeginSfx();
              onBegin();
            }}
          >
            TAP TO BEGIN
          </button>
        )}
      </div>
    </div>
  );
}
