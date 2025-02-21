import React, { useEffect } from "react";
import { EditAyahModal } from "./components/EditAyahModal";
import { LoadingButton } from "./components/LoadingButton";
import { useAtomValue } from "jotai";
import { splitAyahsAtom } from "./stores/audioCache";

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
  }, [ayahs.length]);

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
  const splitAyahs = useAtomValue(splitAyahsAtom);

  // Extract the ayah ID from the src URL
  const ayahId = src.split("/").pop()?.split(".")[0];
  const version = ayahId ? splitAyahs[ayahId] || 0 : 0;

  return (
    <audio
      controls
      src={`${src}?v=${version}`}
      title={title}
      className="w-[300px] px-1"
    >
      <track kind="captions" />
    </audio>
  );
}

function getSurahStatus(
  ayahs: Ayah[],
  surahNumber: number
): "all" | "some" | "none" | "unprocessed" {
  const surahAyahs = ayahs.filter(
    (ayah) => getSurahNumber(ayah.id) === surahNumber
  );

  if (surahAyahs.length === 0) return "none";

  const processedAyahs = surahAyahs.filter((ayah) => ayah.matches !== null);
  if (processedAyahs.length === 0) return "unprocessed";

  const matchingAyahs = processedAyahs.filter((ayah) => ayah.matches === true);

  if (matchingAyahs.length === processedAyahs.length) return "all";
  return "some";
}

interface SurahSelectorProps {
  surahNumbers: number[];
  selectedSurah: number;
  onChange: (surah: number) => void;
  ayahs: Ayah[];
}

function SurahSelector({
  surahNumbers,
  selectedSurah,
  onChange,
  ayahs,
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
        {surahNumbers.map((number) => {
          const status = getSurahStatus(ayahs, number);
          const statusIcon =
            status === "all" ? "✅" : status === "some" ? "⚠️" : "";

          return (
            <option key={number} value={number}>
              Surah {number} {statusIcon}
            </option>
          );
        })}
      </select>
    </div>
  );
}

interface AyahTableProps {
  ayahs: Ayah[];
  onRefresh: () => Promise<void>;
}

function AyahTable({ ayahs, onRefresh }: AyahTableProps) {
  const [editingAyah, setEditingAyah] = React.useState<Ayah | null>(null);

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

  const handleSplitAtTime = async (time: number) => {
    if (!editingAyah) return;

    const response = await fetch(
      `${API_BASE_URL}/split_custom/${editingAyah.id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ split_time_ms: time }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to split ayah: ${response.statusText}`);
    }

    await onRefresh();
  };

  return (
    <>
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
                    {ayah.matches !== null && !ayah.matches && (
                      <LoadingButton
                        onClick={async () => {
                          setEditingAyah(ayah);
                        }}
                        className="rounded bg-blue-500 px-2 py-1 text-white text-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Edit
                      </LoadingButton>
                    )}

                    {ayah.matches === null && (
                      <LoadingButton
                        onClick={async () => {
                          await splitAyah(ayah.id);
                        }}
                        className="rounded bg-green-500 px-2 py-1 text-white text-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                      >
                        Auto-Split
                      </LoadingButton>
                    )}

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

      {editingAyah && (
        <EditAyahModal
          isOpen={true}
          onClose={() => setEditingAyah(null)}
          ayah={editingAyah}
          onSplit={handleSplitAtTime}
        />
      )}
    </>
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

  useEffect(() => {
    // Connect to SSE endpoint
    const es = new EventSource(`${API_BASE_URL}/events`);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "split_finished") {
          // If a split finishes, refetch data
          refetch();
        } else if (msg.type === "split_failed") {
          alert(`Split failed for ${msg.data.item_id}: ${msg.data.error}`);
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    return () => {
      es.close();
    };
  }, [refetch]);

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
        ayahs={ayahs}
      />
      <AyahTable ayahs={filteredAyahs} onRefresh={refetch} />
    </div>
  );
}
