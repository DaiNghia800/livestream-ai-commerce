"use client";

import { useEffect, useState } from "react";
import { Video, Mic } from "lucide-react";

export interface MediaDeviceInfoSimple {
  deviceId: string;
  label: string;
}

export interface StudioDeviceControlsProps {
  selectedCameraId?: string;
  selectedMicId?: string;
  onCameraChange?: (deviceId: string) => void;
  onMicrophoneChange?: (deviceId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function StudioDeviceControls({
  selectedCameraId = "",
  selectedMicId = "",
  onCameraChange,
  onMicrophoneChange,
  disabled = false,
  className = "",
}: StudioDeviceControlsProps) {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfoSimple[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfoSimple[]>([]);

  useEffect(() => {
    async function loadDevices() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vInputs = devices
          .filter((d) => d.kind === "videoinput")
          .map((d, index) => ({
            deviceId: d.deviceId || `cam-${index}`,
            label: d.label || `Camera ${index + 1}`,
          }));
        const aInputs = devices
          .filter((d) => d.kind === "audioinput")
          .map((d, index) => ({
            deviceId: d.deviceId || `mic-${index}`,
            label: d.label || `Microphone ${index + 1}`,
          }));

        setVideoDevices(vInputs);
        setAudioDevices(aInputs);
      } catch (err) {
        console.warn("Could not enumerate media devices:", err);
      }
    }

    loadDevices();

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", loadDevices);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
      };
    }
  }, []);

  const currentCamLabel = videoDevices.find((d) => d.deviceId === selectedCameraId)?.label || "Camera mặc định";
  const currentMicLabel = audioDevices.find((d) => d.deviceId === selectedMicId)?.label || "Microphone mặc định";

  return (
    <div className={`flex items-center gap-2 sm:gap-2.5 text-xs flex-nowrap shrink-0 min-w-0 ${className}`}>
      {/* Camera Device Selector */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Video className="h-3.5 w-3.5 text-indigo-400 shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-slate-400 hidden 2xl:inline shrink-0">
          CAMERA:
        </span>
        <div className="relative">
          <select
            id="studio-camera-select"
            disabled={disabled || videoDevices.length === 0}
            value={selectedCameraId}
            title={`Thiết bị camera: ${currentCamLabel}`}
            onChange={(e) => onCameraChange?.(e.target.value)}
            className="w-auto max-w-[95px] sm:max-w-[105px] xl:max-w-[115px] 2xl:max-w-[135px] truncate bg-[#1F2A3F] text-slate-100 text-xs rounded-lg border border-slate-700 py-1.5 pl-2 pr-5 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {videoDevices.length > 0 ? (
              videoDevices.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId} title={cam.label}>
                  {cam.label}
                </option>
              ))
            ) : (
              <option value="">Camera mặc định</option>
            )}
          </select>
        </div>
      </div>

      {/* Microphone Device Selector */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Mic className="h-3.5 w-3.5 text-indigo-400 shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-slate-400 hidden 2xl:inline shrink-0">
          MICRO:
        </span>
        <div className="relative">
          <select
            id="studio-mic-select"
            disabled={disabled || audioDevices.length === 0}
            value={selectedMicId}
            title={`Thiết bị micro: ${currentMicLabel}`}
            onChange={(e) => onMicrophoneChange?.(e.target.value)}
            className="w-auto max-w-[95px] sm:max-w-[105px] xl:max-w-[115px] 2xl:max-w-[135px] truncate bg-[#1F2A3F] text-slate-100 text-xs rounded-lg border border-slate-700 py-1.5 pl-2 pr-5 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {audioDevices.length > 0 ? (
              audioDevices.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId} title={mic.label}>
                  {mic.label}
                </option>
              ))
            ) : (
              <option value="">Microphone mặc định</option>
            )}
          </select>
        </div>
      </div>
    </div>
  );
}