import SettingsLayout from "@/layouts/SettingsLayout";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "next-i18next";
import getServerSideProps from "@/lib/client/getServerSideProps";
import { useAiMergeSuggestions, useSubmitAiMerges } from "@linkwarden/router/tags";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Checkbox from "@/components/Checkbox";
import { useRouter } from "next/router";

type MergeSuggestion = {
  id: string; // Stable ID based on tag IDs (e.g., "1-5-12")
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
  const { data, isLoading, error, refetch, isFetching } = useAiMergeSuggestions();
  const submitMerges = useSubmitAiMerges();
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [selectedTagsPerSuggestion, setSelectedTagsPerSuggestion] = useState<Map<string, Set<number>>>(new Map());
  const [customTagNames, setCustomTagNames] = useState<Map<string, string>>(new Map());

  // FEATURE #3: Manual tag name editing
  const [editingTagName, setEditingTagName] = useState<string | null>(null);
  const [tempTagName, setTempTagName] = useState<string>("");

  const suggestions = data?.suggestions || [];

  // CRITICAL: Clear all user selections when suggestions change
  // This prevents dangerous state where selections point to wrong suggestions
  useEffect(() => {
    setSelectedSuggestions(new Set());
    setSelectedTagsPerSuggestion(new Map());
    setCustomTagNames(new Map());
  }, [data]); // Re-run when data changes (new suggestions loaded)

  const toggleSuggestion = (suggestionId: string, suggestion: MergeSuggestion) => {
    setSelectedSuggestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(suggestionId)) {
        newSet.delete(suggestionId);
        // FEATURE #1: Don't clear tag selections - they persist for later
        // User can deselect suggestion, then reselect and their tag choices are preserved
      } else {
        newSet.add(suggestionId);
        // Only initialize tag selections if they don't already exist
        setSelectedTagsPerSuggestion((prevTags) => {
          const newMap = new Map(prevTags);
          if (!newMap.has(suggestionId)) {
            // First time selecting - initialize with all tags
            const allTagIds = new Set(suggestion.tags.map(t => t.id));
            newMap.set(suggestionId, allTagIds);
          }
          // Else: Keep existing selections from previous toggle
          return newMap;
        });
      }
      return newSet;
    });
  };

  const setNewTagName = (suggestionId: string, tagName: string) => {
    // FEATURE #3: Validate tag name before saving
    const trimmed = tagName.trim();
    if (trimmed.length === 0) {
      toast.error("Tag name cannot be empty");
      return false;
    }
    if (trimmed.length > 50) {
      toast.error("Tag name cannot exceed 50 characters");
      return false;
    }
    // Additional validation: no leading/trailing whitespace, no tabs/newlines
    if (trimmed !== tagName) {
      tagName = trimmed;
    }
    if (/[\t\n\r]/.test(tagName)) {
      toast.error("Tag name cannot contain tabs or newlines");
      return false;
    }

    setCustomTagNames((prev) => {
      const newMap = new Map(prev);
      newMap.set(suggestionId, tagName);
      return newMap;
    });
    return true;
  };

  // FEATURE #3: Save edited tag name and exit edit mode
  const saveEditedTagName = (suggestionId: string) => {
    if (tempTagName.trim() && setNewTagName(suggestionId, tempTagName.trim())) {
      setEditingTagName(null);
      setTempTagName("");
    }
  };

  // FEATURE #3: Cancel editing without saving
  const cancelEditingTagName = () => {
    setEditingTagName(null);
    setTempTagName("");
  };

  const getNewTagName = (suggestionId: string, suggestion: MergeSuggestion): string => {
    return customTagNames.get(suggestionId) || suggestion.newName || "";
  };

  const toggleTagInSuggestion = (suggestionId: string, tagId: number) => {
    setSelectedTagsPerSuggestion((prev) => {
      const newMap = new Map(prev);
      const selectedTags = newMap.get(suggestionId) || new Set();
      const newSelectedTags = new Set(selectedTags);

      if (newSelectedTags.has(tagId)) {
        newSelectedTags.delete(tagId);
      } else {
        newSelectedTags.add(tagId);
      }

      newMap.set(suggestionId, newSelectedTags);
      return newMap;
    });
  };

  const isTagSelected = (suggestionId: string, tagId: number) => {
    const selectedTags = selectedTagsPerSuggestion.get(suggestionId);
    return selectedTags ? selectedTags.has(tagId) : false;
  };

  const toggleSelectAll = () => {
    if (selectedSuggestions.size === suggestions.length && suggestions.length > 0) {
      setSelectedSuggestions(new Set());
      // FEATURE #1: Don't clear tag selections or custom names - they persist
    } else {
      const allIds = suggestions.map((s) => s.id);
      setSelectedSuggestions(new Set(allIds));
      // Only initialize tag selections for suggestions that don't have them yet
      setSelectedTagsPerSuggestion((prevTags) => {
        const newTagSelections = new Map(prevTags);
        suggestions.forEach((suggestion) => {
          if (!newTagSelections.has(suggestion.id)) {
            newTagSelections.set(suggestion.id, new Set(suggestion.tags.map(t => t.id)));
          }
        });
        return newTagSelections;
      });
    }
  };

  const handleRefresh = async () => {
    // FEATURE #2: Use query's built-in isFetching state instead of local state
    // This ensures refresh state persists even if user navigates away
    setSelectedSuggestions(new Set());
    setSelectedTagsPerSuggestion(new Map());
    setCustomTagNames(new Map());
    await refetch();
  };

  const handleSubmit = async () => {
    if (selectedSuggestions.size === 0) {
      toast.error("Please select at least one merge suggestion");
      return;
    }

    // Validate that each selected suggestion has at least 2 selected tags
    const invalidSuggestions: string[] = [];
    Array.from(selectedSuggestions).forEach((suggestionId) => {
      const selectedTags = selectedTagsPerSuggestion.get(suggestionId);
      const suggestion = suggestions.find(s => s.id === suggestionId);
      if (!selectedTags || selectedTags.size < 2) {
        invalidSuggestions.push(suggestion ? getNewTagName(suggestionId, suggestion) : suggestionId);
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
      const mergesToSubmit = Array.from(selectedSuggestions).map((suggestionId) => {
        const selectedTags = selectedTagsPerSuggestion.get(suggestionId) || new Set();
        const selectedTagIds = Array.from(selectedTags);
        const suggestion = suggestions.find(s => s.id === suggestionId)!;

        return {
          newTagName: getNewTagName(suggestionId, suggestion),
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
            disabled={isLoading || isFetching}
          >
            <i className={`bi-arrow-clockwise mr-2 ${isFetching ? "animate-spin" : ""}`} />
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
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    selectedSuggestions.has(suggestion.id)
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      state={selectedSuggestions.has(suggestion.id)}
                      onClick={() => toggleSuggestion(suggestion.id, suggestion)}
                      label=""
                    />

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <i className={`bi-arrow-right-circle ${selectedSuggestions.has(suggestion.id) ? "text-blue-600" : "text-white"}`} />

                        {/* FEATURE #3: Manual tag name editing with input field */}
                        {editingTagName === suggestion.id ? (
                          <input
                            type="text"
                            value={tempTagName}
                            onChange={(e) => setTempTagName(e.target.value)}
                            onBlur={() => saveEditedTagName(suggestion.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveEditedTagName(suggestion.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEditingTagName();
                              }
                            }}
                            autoFocus
                            className="font-semibold text-lg px-2 py-1 border-2 border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-900"
                            maxLength={50}
                            placeholder="Enter tag name"
                          />
                        ) : (
                          <>
                            <span className={`font-semibold text-lg ${selectedSuggestions.has(suggestion.id) ? "text-gray-900" : "text-white"}`}>
                              {getNewTagName(suggestion.id, suggestion)}
                            </span>
                            {selectedSuggestions.has(suggestion.id) && (
                              <i
                                className="bi-pencil text-sm text-gray-500 hover:text-blue-600 cursor-pointer transition-colors"
                                onClick={() => {
                                  setTempTagName(getNewTagName(suggestion.id, suggestion));
                                  setEditingTagName(suggestion.id);
                                }}
                                title="Edit tag name manually"
                              />
                            )}
                          </>
                        )}

                        <span className={`text-xs px-2 py-1 rounded ${selectedSuggestions.has(suggestion.id) ? "text-gray-500 bg-gray-100" : "text-gray-300 bg-gray-700"}`}>
                          {suggestion.tags.reduce(
                            (sum, tag) => sum + tag.linkCount,
                            0
                          )}{" "}
                          total links
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-2">
                        {suggestion.tags.map((tag) => {
                          const isSuggestionSelected = selectedSuggestions.has(suggestion.id);
                          const isThisTagSelected = isTagSelected(suggestion.id, tag.id);
                          const isNewTagName = getNewTagName(suggestion.id, suggestion) === tag.name;

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
                                    toggleTagInSuggestion(suggestion.id, tag.id);
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
                                    setNewTagName(suggestion.id, tag.name);
                                  }}
                                  className={`${isNewTagName ? "bi-star-fill text-yellow-500" : "bi-star text-gray-400 hover:text-yellow-500"} text-xs cursor-pointer ml-1`}
                                  title={isNewTagName ? "This is the new tag name" : "Click to use as new tag name"}
                                />
                              )}
                            </span>
                          );
                        })}
                      </div>

                      {selectedSuggestions.has(suggestion.id) && (
                        <p className="text-xs text-blue-700 mb-2">
                          <i className="bi-info-circle mr-1" />
                          Click tag names to include/exclude. Click <i className="bi-star text-xs" /> to set as new tag name, or <i className="bi-pencil text-xs" /> to type custom name. At least 2 tags required.
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
