import SettingsLayout from "@/layouts/SettingsLayout";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "next-i18next";
import getServerSideProps from "@/lib/client/getServerSideProps";
import { useAiMergeSuggestions, useSubmitAiMerges } from "@linkwarden/router/tags";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Checkbox from "@/components/Checkbox";
import { useRouter } from "next/router";

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
  const router = useRouter();
  const { data, isLoading, error, refetch } = useAiMergeSuggestions();
  const submitMerges = useSubmitAiMerges();
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [selectedTagsPerSuggestion, setSelectedTagsPerSuggestion] = useState<Map<number, Set<number>>>(new Map());
  const [customTagNames, setCustomTagNames] = useState<Map<number, string>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const suggestions = data?.suggestions || [];

  const toggleSuggestion = (index: number) => {
    setSelectedSuggestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
        // Clear tag selections when deselecting suggestion
        setSelectedTagsPerSuggestion((prevTags) => {
          const newMap = new Map(prevTags);
          newMap.delete(index);
          return newMap;
        });
        // Clear custom tag name when deselecting
        setCustomTagNames((prevNames) => {
          const newMap = new Map(prevNames);
          newMap.delete(index);
          return newMap;
        });
      } else {
        newSet.add(index);
        // Initialize all tags as selected when selecting suggestion
        const allTagIds = new Set(suggestions[index].tags.map(t => t.id));
        setSelectedTagsPerSuggestion((prevTags) => {
          const newMap = new Map(prevTags);
          newMap.set(index, allTagIds);
          return newMap;
        });
      }
      return newSet;
    });
  };

  const setNewTagName = (suggestionIndex: number, tagName: string) => {
    setCustomTagNames((prev) => {
      const newMap = new Map(prev);
      newMap.set(suggestionIndex, tagName);
      return newMap;
    });
  };

  const getNewTagName = (suggestionIndex: number): string => {
    return customTagNames.get(suggestionIndex) || suggestions[suggestionIndex]?.newName || "";
  };

  const toggleTagInSuggestion = (suggestionIndex: number, tagId: number) => {
    setSelectedTagsPerSuggestion((prev) => {
      const newMap = new Map(prev);
      const selectedTags = newMap.get(suggestionIndex) || new Set();
      const newSelectedTags = new Set(selectedTags);

      if (newSelectedTags.has(tagId)) {
        newSelectedTags.delete(tagId);
      } else {
        newSelectedTags.add(tagId);
      }

      newMap.set(suggestionIndex, newSelectedTags);
      return newMap;
    });
  };

  const isTagSelected = (suggestionIndex: number, tagId: number) => {
    const selectedTags = selectedTagsPerSuggestion.get(suggestionIndex);
    return selectedTags ? selectedTags.has(tagId) : false;
  };

  const toggleSelectAll = () => {
    if (selectedSuggestions.size === suggestions.length && suggestions.length > 0) {
      setSelectedSuggestions(new Set());
      setSelectedTagsPerSuggestion(new Map());
      setCustomTagNames(new Map());
    } else {
      const allIndices = suggestions.map((_, i) => i);
      setSelectedSuggestions(new Set(allIndices));
      // Initialize all tags as selected for all suggestions
      const newTagSelections = new Map<number, Set<number>>();
      suggestions.forEach((suggestion, index) => {
        newTagSelections.set(index, new Set(suggestion.tags.map(t => t.id)));
      });
      setSelectedTagsPerSuggestion(newTagSelections);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSelectedSuggestions(new Set());
    setSelectedTagsPerSuggestion(new Map());
    setCustomTagNames(new Map());
    await refetch();
    setIsRefreshing(false);
  };

  const handleSubmit = async () => {
    if (selectedSuggestions.size === 0) {
      toast.error("Please select at least one merge suggestion");
      return;
    }

    // Validate that each selected suggestion has at least 2 selected tags
    const invalidSuggestions: string[] = [];
    Array.from(selectedSuggestions).forEach((index) => {
      const selectedTags = selectedTagsPerSuggestion.get(index);
      if (!selectedTags || selectedTags.size < 2) {
        invalidSuggestions.push(getNewTagName(index));
      }
    });

    if (invalidSuggestions.length > 0) {
      toast.error(
        `Each merge must have at least 2 tags selected. Please check suggestion(s): ${invalidSuggestions.join(", ")}`
      );
      return;
    }

    const load = toast.loading(
      `Queueing ${selectedSuggestions.size} merge operation(s)...`
    );

    try {
      const mergesToSubmit = Array.from(selectedSuggestions).map((index) => {
        const selectedTags = selectedTagsPerSuggestion.get(index) || new Set();
        const selectedTagIds = Array.from(selectedTags);

        return {
          newTagName: getNewTagName(index),
          tagIds: selectedTagIds,
        };
      });

      await submitMerges.mutateAsync({ merges: mergesToSubmit });

      toast.dismiss(load);
      toast.success(
        `Successfully queued ${selectedSuggestions.size} merge operation(s). They will be processed in the background.`
      );

      setSelectedSuggestions(new Set());
      setSelectedTagsPerSuggestion(new Map());
      setCustomTagNames(new Map());
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
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
          >
            <i className={`bi-arrow-clockwise mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
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
                  state={selectedSuggestions.size === suggestions.length && suggestions.length > 0}
                  onClick={toggleSelectAll}
                  label={
                    selectedSuggestions.size === suggestions.length && suggestions.length > 0
                      ? t("deselect_all")
                      : t("select_all")
                  }
                />
                <span className="text-sm text-gray-500">
                  {selectedSuggestions.size} {t("of")} {suggestions.length} {t("selected")}
                </span>
              </div>

              <Button
                variant="accent"
                onClick={handleSubmit}
                disabled={selectedSuggestions.size === 0 || submitMerges.isPending}
              >
                <i className="bi-intersect mr-2" />
                {t("merge_selected_count", { count: selectedSuggestions.size })}
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
                      state={selectedSuggestions.has(index)}
                      onClick={() => toggleSuggestion(index)}
                      label=""
                    />

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <i className={`bi-arrow-right-circle ${selectedSuggestions.has(index) ? "text-blue-600" : "text-white"}`} />
                        <span className={`font-semibold text-lg ${selectedSuggestions.has(index) ? "text-gray-900" : "text-white"}`}>
                          {getNewTagName(index)}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${selectedSuggestions.has(index) ? "text-gray-500 bg-gray-100" : "text-gray-300 bg-gray-700"}`}>
                          {suggestion.tags.reduce(
                            (sum, tag) => sum + tag.linkCount,
                            0
                          )}{" "}
                          total links
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-2">
                        {suggestion.tags.map((tag) => {
                          const isSuggestionSelected = selectedSuggestions.has(index);
                          const isThisTagSelected = isTagSelected(index, tag.id);
                          const isNewTagName = getNewTagName(index) === tag.name;

                          return (
                            <span
                              key={tag.id}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-all ${
                                isSuggestionSelected
                                  ? isThisTagSelected
                                    ? "bg-blue-200 hover:bg-blue-300 border-2 border-blue-600"
                                    : "bg-gray-200 hover:bg-gray-300 border-2 border-gray-400 opacity-50"
                                  : "bg-gray-100 hover:bg-gray-200 border-2 border-transparent"
                              }`}
                            >
                              {isSuggestionSelected && (
                                <i className={`${isThisTagSelected ? "bi-check-circle-fill text-blue-700" : "bi-circle text-gray-500"} text-xs`} />
                              )}
                              <span
                                onClick={(e) => {
                                  if (isSuggestionSelected) {
                                    // Toggle tag selection
                                    e.stopPropagation();
                                    toggleTagInSuggestion(index, tag.id);
                                  } else {
                                    // Open tag URL when suggestion is not selected
                                    window.open(`${router.basePath}${tag.url}`, '_blank');
                                  }
                                }}
                                className="font-medium text-gray-900 cursor-pointer"
                                title={
                                  isSuggestionSelected
                                    ? isThisTagSelected
                                      ? "Click to exclude this tag from merge"
                                      : "Click to include this tag in merge"
                                    : "Click to view tag"
                                }
                              >
                                {tag.name}
                              </span>
                              <span className="text-xs text-gray-600">
                                ({tag.linkCount})
                              </span>
                              {isSuggestionSelected && (
                                <i
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNewTagName(index, tag.name);
                                  }}
                                  className={`${isNewTagName ? "bi-star-fill text-yellow-500" : "bi-star text-gray-400 hover:text-yellow-500"} text-xs cursor-pointer ml-1`}
                                  title={isNewTagName ? "This is the new tag name" : "Click to use as new tag name"}
                                />
                              )}
                            </span>
                          );
                        })}
                      </div>

                      {selectedSuggestions.has(index) && (
                        <p className="text-xs text-blue-700 mb-2">
                          <i className="bi-info-circle mr-1" />
                          Click tag names to include/exclude. Click <i className="bi-star text-xs" /> to set as new tag name. At least 2 tags required.
                        </p>
                      )}

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
