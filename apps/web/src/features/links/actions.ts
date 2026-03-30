import type { Dispatch, SetStateAction } from "react";
import type { ExternalLink } from "@camping/shared";
import { apiClient } from "../../api/client";
import { confirmDeletion } from "../../app/browser-helpers";
import { getErrorMessage } from "../../app/common-formatters";
import { createEmptyLink } from "../../app/view-model-drafts";
import type { OperationState } from "../../app/view-model-types";
import { sortLinks } from "../../app/planning-history-helpers";

type LinkDraft = ReturnType<typeof createEmptyLink>;

type BuildLinkActionsInput = {
  linkDraft: LinkDraft;
  setLinkDraft: Dispatch<SetStateAction<LinkDraft>>;
  setLinks: Dispatch<SetStateAction<ExternalLink[]>>;
  setOperationState: Dispatch<SetStateAction<OperationState | null>>;
};

export function buildLinkActions(input: BuildLinkActionsInput) {
  async function handleCreateLink() {
    try {
      const response = await apiClient.createLink(input.linkDraft);
      input.setLinks((current) => [...current, response.item].sort(sortLinks));
      input.setLinkDraft(createEmptyLink());
      input.setOperationState({
        title: "외부 링크 추가 완료",
        tone: "success",
        description: response.item.name,
      });
    } catch (error) {
      input.setOperationState({
        title: "외부 링크 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveLink(link: ExternalLink) {
    try {
      const response = await apiClient.updateLink(link.id, link);
      input.setLinks((current) =>
        current
          .map((item) => (item.id === response.item.id ? response.item : item))
          .sort(sortLinks),
      );
      input.setOperationState({
        title: "외부 링크 저장 완료",
        tone: "success",
        description: response.item.name,
      });
    } catch (error) {
      input.setOperationState({
        title: "외부 링크 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteLink(linkId: string) {
    if (!confirmDeletion(`외부 링크를 삭제할까요?\n${linkId}`)) {
      return;
    }

    try {
      await apiClient.deleteLink(linkId);
      input.setLinks((current) => current.filter((item) => item.id !== linkId));
      input.setOperationState({
        title: "외부 링크 삭제 완료",
        tone: "success",
        description: linkId,
      });
    } catch (error) {
      input.setOperationState({
        title: "외부 링크 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  return {
    handleCreateLink,
    handleDeleteLink,
    handleSaveLink,
  };
}
