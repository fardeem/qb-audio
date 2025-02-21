import WaveSurfer from "@wavesurfer/react";
import { useState } from "react";
import { LoadingButton } from "./LoadingButton";

interface EditAyahModalProps {
  isOpen: boolean;
  onClose: () => void;
  ayah: {
    id: string;
    combined_url: string;
  };
  onSplit: (time: number) => Promise<void>;
}

export function EditAyahModal({
  isOpen,
  onClose,
  ayah,
  onSplit,
}: EditAyahModalProps) {
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const handleSplit = async () => {
    if (currentTime !== null) {
      await onSplit(currentTime * 1000);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg w-[800px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Edit Ayah {ayah.id}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <WaveSurfer
            height={128}
            waveColor="rgb(59, 130, 246)"
            progressColor="rgb(37, 99, 235)"
            url={ayah.combined_url}
            onReady={(wavesurfer) => {
              setDuration(wavesurfer.getDuration());
            }}
            onTimeupdate={(wavesurfer) => {
              setCurrentTime(wavesurfer.getCurrentTime());
            }}
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            Duration: {duration ? duration.toFixed(2) : "--"} seconds
          </div>
          <div className="text-sm text-gray-600">
            Current Time: {currentTime ? currentTime.toFixed(2) : "--"} seconds
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>

          <LoadingButton
            onClick={handleSplit}
            // disabled={currentTime === null}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Split at {currentTime?.toFixed(2) ?? "--"}s
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
