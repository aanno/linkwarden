import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useMemo } from "react";
import {
  MobileAuth,
  TagIncludingLinkCount,
  PaginatedTags,
} from "@linkwarden/types";
import { useSession } from "next-auth/react";
import { ArchivalTagOption } from "@linkwarden/types/inputSelect";
import {
  MergeTagsSchemaType,
  TagBulkDeletionSchemaType,
} from "@linkwarden/lib/schemaValidation";

type UseTagsOptions = {
  cursor?: number;
  limit?: number;
  paginated?: boolean;
};

// Result type for useTags hook
type UseTagsResult = {
  tags: TagIncludingLinkCount[];
  total?: number;
};

// Backward compatible version - returns all tags as array
// Uses same query key as useTagsPaginated but extracts items and includes total count
const useTags = (
  auth?: MobileAuth,
  options: UseTagsOptions = {}
): UseQueryResult<UseTagsResult, Error> => {
  let status: "loading" | "authenticated" | "unauthenticated";

  if (!auth) {
    const session = useSession();
    status = session.status;
  } else {
    status = auth?.status;
  }

  const { cursor, limit = 1000 } = options;

  return useQuery({
    queryKey: ["tags-paginated", { cursor, limit }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (limit) params.append("limit", String(limit));
      if (cursor) params.append("cursor", String(cursor));

      const url =
        (auth?.instance ? auth?.instance : "") +
        "/api/v1/tags?" +
        params.toString();

      const response = await fetch(
        url,
        auth?.session
          ? {
              headers: {
                Authorization: `Bearer ${auth.session}`,
              },
            }
          : undefined
      );
      if (!response.ok) throw new Error("Failed to fetch tags.");

      const data = await response.json();
      // Return items array and total for backward compatibility
      return {
        tags: data.response.items,
        total: data.response.total,
      };
    },
    enabled: status === "authenticated",
  });
};

// New paginated version - returns full paginated response
const useTagsPaginated = (
  auth?: MobileAuth,
  options: UseTagsOptions = {}
): UseQueryResult<PaginatedTags, Error> => {
  let status: "loading" | "authenticated" | "unauthenticated";

  if (!auth) {
    const session = useSession();
    status = session.status;
  } else {
    status = auth?.status;
  }

  const { cursor, limit = 50 } = options;

  return useQuery({
    queryKey: ["tags-paginated", { cursor, limit }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (limit) params.append("limit", String(limit));
      if (cursor) params.append("cursor", String(cursor));

      const url =
        (auth?.instance ? auth?.instance : "") +
        "/api/v1/tags?" +
        params.toString();

      const response = await fetch(
        url,
        auth?.session
          ? {
              headers: {
                Authorization: `Bearer ${auth.session}`,
              },
            }
          : undefined
      );
      if (!response.ok) throw new Error("Failed to fetch tags.");

      const data = await response.json();
      return data.response;
    },
    enabled: status === "authenticated",
  });
};

const useUpdateTag = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tag: TagIncludingLinkCount) => {
      const response = await fetch(`/api/v1/tags/${tag.id}`, {
        body: JSON.stringify(tag),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.response);

      return data.response;
    },
    onSuccess: () => {
      // Invalidate tags queries to refetch with updated data
      queryClient.invalidateQueries({ queryKey: ["tags-paginated"] });
    },
  });
};

const useUpsertTags = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tags: ArchivalTagOption[]) => {
      const response = await fetch("/api/v1/tags", {
        body: JSON.stringify({ tags }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.response);

      return data.response;
    },
    onSuccess: () => {
      // Invalidate tags queries to refetch with updated data
      queryClient.invalidateQueries({ queryKey: ["tags-paginated"] });
    },
  });
};

const useRemoveTag = (auth?: MobileAuth) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tagId: number) => {
      const response = await fetch(
        (auth?.instance ? auth?.instance : "") + `/api/v1/tags/${tagId}`,
        {
          method: "DELETE",
          headers: {
            ...(auth?.session
              ? { Authorization: `Bearer ${auth.session}` }
              : {}),
          },
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.response);

      return data.response;
    },
    onSuccess: () => {
      // Invalidate tags queries to refetch with updated data
      queryClient.invalidateQueries({ queryKey: ["tags-paginated"] });
    },
  });
};

const useBulkTagDeletion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: TagBulkDeletionSchemaType) => {
      const response = await fetch(`/api/v1/tags`, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });

      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.response);

      return responseData.response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
  });
};

const useMergeTags = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: MergeTagsSchemaType) => {
      const response = await fetch(`/api/v1/tags/merge`, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.response);

      return responseData.response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
  });
};

// Infinite scroll version for tags page - similar to useLinks
const useTagsInfinite = (
  params: { sort?: string; dir?: string; search?: string } = {}
) => {
  const session = useSession();

  const { data, ...rest } = useInfiniteQuery({
    queryKey: ["tags-infinite", params],
    queryFn: async ({ pageParam }) => {
      const queryParams = new URLSearchParams();
      queryParams.append("limit", "50");
      if (pageParam) queryParams.append("cursor", String(pageParam));
      if (params.sort) queryParams.append("sort", params.sort);
      if (params.dir) queryParams.append("dir", params.dir);
      if (params.search) queryParams.append("search", params.search);

      const response = await fetch(`/api/v1/tags?${queryParams.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch tags.");

      const data = await response.json();
      return {
        tags: data.response.items as TagIncludingLinkCount[],
        nextCursor: data.response.nextCursor as number | null,
      };
    },
    initialPageParam: undefined as number | undefined,
    refetchOnWindowFocus: false,
    getNextPageParam: (lastPage) => {
      if (lastPage.nextCursor === null) {
        return undefined;
      }
      return lastPage.nextCursor;
    },
    enabled: session.status === "authenticated",
  });

  const tags = useMemo(() => {
    return data?.pages?.flatMap((page) => page?.tags ?? []) ?? [];
  }, [data]);

  return {
    tags,
    data: { ...data, ...rest },
  };
};

type AiMergeSuggestion = {
  newName: string;
  tags: Array<{
    id: number;
    name: string;
    linkCount: number;
    url: string;
  }>;
  reason: string;
};

type AiMergeSuggestionsResponse = {
  suggestions: AiMergeSuggestion[];
};

const useAiMergeSuggestions = (): UseQueryResult<AiMergeSuggestionsResponse, Error> => {
  const session = useSession();

  return useQuery({
    queryKey: ["ai-merge-suggestions"],
    queryFn: async () => {
      const response = await fetch("/api/v1/tags/ai_merge");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.response || "Failed to fetch AI merge suggestions");
      }
      const data = await response.json();
      return data.response;
    },
    enabled: session.status === "authenticated",
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

type SubmitAiMergesPayload = {
  merges: Array<{
    newTagName: string;
    tagIds: number[];
    mode?: 'merge' | 'additional'; // FEATURE #4: Optional mode for backward compatibility
  }>;
};

const useSubmitAiMerges = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: SubmitAiMergesPayload) => {
      const response = await fetch("/api/v1/tags/ai_merge", {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.response);

      return { response: responseData.response, requestBody: body };
    },
    onSuccess: (data) => {
      // Optimistically update the suggestions cache by removing merged items
      const mergedTagIds = new Set<number>();
      data.requestBody.merges.forEach(merge => {
        merge.tagIds.forEach(id => mergedTagIds.add(id));
      });

      queryClient.setQueryData<AiMergeSuggestionsResponse>(
        ["ai-merge-suggestions"],
        (oldData) => {
          if (!oldData) return oldData;

          const updatedSuggestions = oldData.suggestions.filter((suggestion) => {
            // Remove suggestion if any of its tags are being merged
            return !suggestion.tags.some(tag => mergedTagIds.has(tag.id));
          });

          return { suggestions: updatedSuggestions };
        }
      );

      // Invalidate tags to refresh the list
      queryClient.invalidateQueries({ queryKey: ["tags-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
  });
};

export {
  useTags,
  useTagsPaginated,
  useTagsInfinite,
  useUpdateTag,
  useUpsertTags,
  useRemoveTag,
  useBulkTagDeletion,
  useMergeTags,
  useAiMergeSuggestions,
  useSubmitAiMerges,
};
