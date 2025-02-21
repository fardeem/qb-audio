import React, { useEffect } from "react";

const API_BASE_URL = "http://localhost:8000";

interface Ayah {
  id: string;
  combined_url: string;
  arabic_url: string | null;
  english_url: string | null;
  source_translation: string | null;
  english_transcription: string | null;
  matches: boolean | null;
  wer: number | null;
  forced_approved: boolean | null;
}

function useAyahs() {
  const [ayahs, setAyahs] = React.useState<Ayah[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAyahs = React.useCallback(async () => {
    try {
      if (ayahs.length === 0) {
        setIsLoading(true);
      }
      const response = await fetch(`${API_BASE_URL}/ayahs`);
      if (!response.ok) {
        throw new Error("Failed to fetch ayahs");
      }
      const data = await response.json();
      setAyahs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAyahs();
  }, [fetchAyahs]);

  return { ayahs, isLoading, error, refetch: fetchAyahs };
}

function getSurahNumber(ayahId: string): number {
  return parseInt(ayahId.split("_")[0]);
}

interface AudioPlayerProps {
  src: string;
  title: string;
}

function AudioPlayer({ src, title }: AudioPlayerProps) {
  return (
    <audio controls src={src} title={title} className="w-[300px] px-1">
      <track kind="captions" />
    </audio>
  );
}

interface SurahSelectorProps {
  surahNumbers: number[];
  selectedSurah: number;
  onChange: (surah: number) => void;
}

function SurahSelector({
  surahNumbers,
  selectedSurah,
  onChange,
}: SurahSelectorProps) {
  return (
    <div className="mb-6 flex items-center gap-2">
      <label htmlFor="surah-select" className="font-medium text-gray-700">
        Select Surah:
      </label>
      <select
        id="surah-select"
        value={selectedSurah}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="rounded-md border border-gray-300 px-3 py-1.5 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {surahNumbers.map((number) => (
          <option key={number} value={number}>
            Surah {number}
          </option>
        ))}
      </select>
    </div>
  );
}

interface LoadingButtonProps {
  onClick: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

function LoadingButton({
  onClick,
  children,
  className = "",
}: LoadingButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onClick();
    } catch (err) {
      alert(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`${className} ${
        isLoading ? "cursor-wait opacity-75" : ""
      }`.trim()}
    >
      {isLoading ? "Loading..." : children}
    </button>
  );
}

interface AyahTableProps {
  ayahs: Ayah[];
  onRefresh: () => Promise<void>;
}

function AyahTable({ ayahs, onRefresh }: AyahTableProps) {
  const splitAyah = async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/split/${id}`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to split ayah: ${response.statusText}`);
    }

    // Refresh the ayahs list after successful split
    await onRefresh();
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow relative">
      <table className="min-w-full divide-y divide-gray-200 table-fixed">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-24 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              ID
            </th>
            <th className="w-16 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Matches
            </th>
            <th className="w-48 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Combined
            </th>
            <th className="w-48 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Arabic
            </th>
            <th className="w-48 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              English
            </th>
            <th className="w-[300px] px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Source
            </th>
            <th className="w-[300px] px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Transcription
            </th>
            <th className="w-16 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              WER
            </th>
            <th className="w-48 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 sticky right-0 bg-gray-50 border-l">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {ayahs.map((ayah) => (
            <tr key={ayah.id} className="hover:bg-gray-50">
              <td className="truncate px-2 py-2 text-sm text-gray-900">
                {ayah.id}
              </td>
              <td
                className="px-2 py-2 text-gray-500 text-2xl"
                style={{ fontFamily: "Apple Color Emoji" }}
              >
                {ayah.matches === null ? "-" : ayah.matches ? "✅" : "❌"}
              </td>
              <td className="py-2 px-2">
                {ayah.combined_url && (
                  <AudioPlayer
                    src={ayah.combined_url}
                    title={`Combined audio for ayah ${ayah.id}`}
                  />
                )}
              </td>
              <td className="py-2 px-2">
                {ayah.arabic_url && (
                  <AudioPlayer
                    src={ayah.arabic_url}
                    title={`Arabic audio for ayah ${ayah.id}`}
                  />
                )}
              </td>
              <td className="py-2 px-2">
                {ayah.english_url && (
                  <AudioPlayer
                    src={ayah.english_url}
                    title={`English audio for ayah ${ayah.id}`}
                  />
                )}
              </td>
              <td
                className="px-2 py-2 text-sm text-gray-500 break-words"
                title={ayah.source_translation || ""}
              >
                {ayah.source_translation || "-"}
              </td>
              <td
                className="px-2 py-2 text-sm text-gray-500 break-words"
                title={ayah.english_transcription || ""}
              >
                {ayah.english_transcription || "-"}
              </td>
              <td className="px-2 py-2 text-sm text-gray-500">
                {ayah.wer === null ? "-" : ayah.wer.toFixed(2)}
              </td>
              <td className="text-sm sticky right-0 bg-white border-l">
                <div className="px-2 py-2 flex gap-1">
                  {ayah.matches !== null && (
                    <LoadingButton
                      onClick={async () => {
                        await new Promise((resolve) =>
                          setTimeout(resolve, 1000)
                        );
                        console.log("Edit", ayah.id);
                      }}
                      className="rounded bg-blue-500 px-2 py-1 text-white text-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Edit
                    </LoadingButton>
                  )}

                  <LoadingButton
                    onClick={async () => {
                      await splitAyah(ayah.id);
                    }}
                    className="rounded bg-green-500 px-2 py-1 text-white text-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    Auto-Split
                  </LoadingButton>

                  {ayah.matches !== null && !ayah.matches && (
                    <LoadingButton
                      onClick={async () => {
                        await fetch(`${API_BASE_URL}/approve/${ayah.id}`, {
                          method: "POST",
                        });

                        await onRefresh();
                      }}
                      className="rounded bg-red-500 px-2 py-1 text-white text-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    >
                      Approve
                    </LoadingButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseAyahId(ayahId: string): { surah: number; ayah: number } {
  const parts = ayahId.split("_");
  return {
    surah: parseInt(parts[0]),
    ayah: parts.length > 1 ? parseInt(parts[1]) : 0,
  };
}

export default function App() {
  const { ayahs, isLoading, error, refetch } = useAyahs();
  const [selectedSurah, setSelectedSurah] = React.useState<number | null>(null);

  const surahNumbers = Array.from(
    new Set(ayahs.map((ayah) => getSurahNumber(ayah.id)))
  ).sort((a, b) => a - b);

  // Set initial surah if not set
  useEffect(() => {
    if (surahNumbers.length > 0 && selectedSurah === null) {
      setSelectedSurah(surahNumbers[0]);
    }
  }, [surahNumbers, selectedSurah]);

  // Don't render until we have a selected surah
  if (selectedSurah === null) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg font-medium text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg font-medium text-red-600">Error: {error}</div>
      </div>
    );
  }

  const filteredAyahs = ayahs
    .filter((ayah) => getSurahNumber(ayah.id) === selectedSurah)
    .sort((a, b) => {
      const idA = parseAyahId(a.id);
      const idB = parseAyahId(b.id);
      if (idA.surah !== idB.surah) {
        return idA.surah - idB.surah;
      }
      return idA.ayah - idB.ayah;
    });

  return (
    <div className=" mx-auto px-4 py-8">
      <SurahSelector
        surahNumbers={surahNumbers}
        selectedSurah={selectedSurah}
        onChange={setSelectedSurah}
      />
      <AyahTable ayahs={filteredAyahs} onRefresh={refetch} />
    </div>
  );
}
