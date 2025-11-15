import SettingsLayout from "@/layouts/SettingsLayout";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "next-i18next";
import getServerSideProps from "@/lib/client/getServerSideProps";
import { useAiMergeSuggestions, useSubmitAiMerges } from "@linkwarden/router/tags";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Checkbox from "@/components/Checkbox";

type MergeSuggestion = {
  newName: string;
  tags: Array<{
    id: number;
    name: string;
    linkCount: number;
    url: string;
  }>;
  reason: string;
};

export default function AiMergeTags() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useAiMergeSuggestions();
  const submitMerges = useSubmitAiMerges();
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());

  const suggestions = data?.suggestions || [];

  const toggleSuggestion = (index: number) => {
    setSelectedSuggestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSuggestions.size === suggestions.length) {
      setSelectedSuggestions(new Set());
    } else {
      setSelectedSuggestions(new Set(suggestions.map((_, i) => i)));
    }
  };

  const handleSubmit = async () => {
    if (selectedSuggestions.size === 0) {
      toast.error("Please select at least one merge suggestion");
      return;
    }

    const load = toast.loading(
      `Queueing ${selectedSuggestions.size} merge operation(s)...`
    );

    try {
      const mergesToSubmit = Array.from(selectedSuggestions).map((index) => {
        const suggestion = suggestions[index];
        return {
          newTagName: suggestion.newName,
          tagIds: suggestion.tags.map((t) => t.id),
        };
      });

      await submitMerges.mutateAsync({ merges: mergesToSubmit });

      toast.dismiss(load);
      toast.success(
        `Successfully queued ${selectedSuggestions.size} merge operation(s). They will be processed in the background.`
      );
      setSelectedSuggestions(new Set());

      // Refetch suggestions after a delay to allow merges to process
      setTimeout(() => refetch(), 2000);
    } catch (err: any) {
      toast.dismiss(load);
      toast.error(err.message || "Failed to queue merge operations");
    }
  };

  return (
    <SettingsLayout>
      <div className="p-5 flex flex-col gap-5 w-full">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-thin">{t("ai_merge_tags")}</p>
            <p className="text-sm text-gray-500 mt-1">
              {t("ai_merge_tags_description")}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <i className="bi-arrow-clockwise mr-2" />
            {t("refresh")}
          </Button>
        </div>

        <Separator />

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <div className="text-center">
              <i className="bi-hourglass-split text-4xl text-gray-400 mb-2" />
              <p className="text-gray-500">{t("generating_suggestions")}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800">
              <i className="bi-exclamation-triangle" />
              <p className="font-medium">{t("error")}</p>
            </div>
            <p className="text-sm text-red-700 mt-1">
              {error.message || "Failed to load suggestions"}
            </p>
          </div>
        )}

        {!isLoading && !error && suggestions.length === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <i className="bi-check-circle text-4xl text-green-600 mb-2" />
            <p className="font-medium text-green-800 mb-1">
              {t("no_merge_suggestions")}
            </p>
            <p className="text-sm text-green-700">
              {t("no_merge_suggestions_description")}
            </p>
          </div>
        )}

        {!isLoading && !error && suggestions.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedSuggestions.size === suggestions.length}
                  onChange={toggleSelectAll}
                  label={
                    selectedSuggestions.size === suggestions.length
                      ? t("deselect_all")
                      : t("select_all")
                  }
                />
                <span className="text-sm text-gray-500">
                  {selectedSuggestions.size} of {suggestions.length} selected
                </span>
              </div>

              <Button
                variant="accent"
                onClick={handleSubmit}
                disabled={selectedSuggestions.size === 0 || submitMerges.isPending}
              >
                <i className="bi-intersect mr-2" />
                {t("merge_selected")} ({selectedSuggestions.size})
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 transition-colors ${
                    selectedSuggestions.has(index)
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedSuggestions.has(index)}
                      onChange={() => toggleSuggestion(index)}
                    />

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="bi-arrow-right-circle text-blue-600" />
                        <span className="font-semibold text-lg">
                          {suggestion.newName}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {suggestion.tags.reduce(
                            (sum, tag) => sum + tag.linkCount,
                            0
                          )}{" "}
                          total links
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-2">
                        {suggestion.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-full text-sm"
                          >
                            <span className="font-medium">{tag.name}</span>
                            <span className="text-xs text-gray-500">
                              ({tag.linkCount})
                            </span>
                          </span>
                        ))}
                      </div>

                      <p className="text-sm text-gray-600 italic">
                        {suggestion.reason}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SettingsLayout>
  );
}

export { getServerSideProps };
