"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Radio, Activity } from "lucide-react";

interface CallAudioPlayerProps {
  transcript: string;
  isLive: boolean;
  secondsLive?: number;
}

export function CallAudioPlayer({ transcript, isLive, secondsLive = 0 }: CallAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.25 | 1.5>(1);
  const [isMuted, setIsMuted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const durationSec = isLive ? secondsLive : 38; // 38s simulated intake recording

  useEffect(() => {
    if (isPlaying) {
      const intervalMs = (1000 / (durationSec || 1)) / playbackSpeed;
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      clearInterval(timerRef.current!);
    }
    return () => {
      clearInterval(timerRef.current!);
    };
  }, [isPlaying, playbackSpeed, durationSec]);

  function togglePlay() {
    if (isPlaying) {
      setIsPlaying(false);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } else {
      setIsPlaying(true);
      if ("speechSynthesis" in window && transcript && !isMuted) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(transcript);
        utterance.rate = playbackSpeed;
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
      }
    }
  }

  function resetAudio() {
    setIsPlaying(false);
    setProgress(0);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function cycleSpeed() {
    const nextSpeed = playbackSpeed === 1 ? 1.25 : playbackSpeed === 1.25 ? 1.5 : 1;
    setPlaybackSpeed(nextSpeed);
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  const currentSec = Math.round((progress / 100) * durationSec);

  // Bars for waveform
  const waveformHeights = [
    20, 45, 60, 30, 75, 90, 40, 80, 65, 35, 95, 70, 50, 85, 30, 60, 40, 75, 55, 25,
    35, 70, 85, 40, 60, 75, 90, 45, 80, 60, 35, 90, 70, 50, 85, 40, 65, 30, 55, 25
  ];

  return (
    <div className="call-audio-player-card" aria-label="Audio Evidence Visualizer">
      <div className="audio-player-top">
        <div className="channel-indicators">
          <div className={`channel-badge ${isLive ? "channel-badge--live" : "channel-badge--playback"}`}>
            {isLive ? <Radio size={12} className="pulse-icon" /> : <Activity size={12} />}
            <span>{isLive ? "Live Stream (Channel 1 + 2)" : "Archived Dual-Channel Audio"}</span>
          </div>
          <span className="codec-badge">Opus 48kHz · Lossless Triage Channel</span>
        </div>

        <div className="audio-meta-controls">
          <button
            type="button"
            className="audio-speed-btn"
            onClick={cycleSpeed}
            title="Cycle Playback Speed (1x, 1.25x, 1.5x)"
          >
            {playbackSpeed}x
          </button>
          <button
            type="button"
            className="audio-mute-btn"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? "Unmute audio" : "Mute audio"}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </div>

      {/* Dynamic Waveform Visualizer */}
      <div className="audio-waveform-track">
        <div className="waveform-bars">
          {waveformHeights.map((h, i) => {
            const barProgress = (i / waveformHeights.length) * 100;
            const isPassed = barProgress <= progress;
            return (
              <span
                key={i}
                className={`wf-bar ${isPassed ? "wf-bar--passed" : ""} ${isPlaying ? "wf-bar--animating" : ""}`}
                style={{
                  height: `${h}%`,
                  animationDelay: `${(i % 10) * 80}ms`,
                }}
              />
            );
          })}
        </div>
        <div
          className="waveform-scrubber-line"
          style={{ left: `${progress}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Scrub & Playback Controls */}
      <div className="audio-controls-row">
        <div className="audio-play-buttons">
          <button
            type="button"
            className="audio-play-toggle-btn"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause call audio" : "Play call audio"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
          </button>
          <button
            type="button"
            className="audio-reset-btn"
            onClick={resetAudio}
            aria-label="Restart audio playback"
            title="Restart playback"
          >
            <RotateCcw size={14} />
          </button>
          <div className="audio-timestamps">
            <span className="time-current">{formatTime(currentSec)}</span>
            <span className="time-divider">/</span>
            <span className="time-duration">{formatTime(durationSec)}</span>
          </div>
        </div>

        <div className="audio-scrub-slider-box">
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="audio-scrubber-input"
            aria-label="Seek call audio position"
          />
        </div>
      </div>
    </div>
  );
}
