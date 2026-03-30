import { useState } from "react";
import type {
  Companion,
  ExternalLink,
  ExternalLinkInput,
  Vehicle,
  VehicleInput,
} from "@camping/shared";
import type { PersistedUiState } from "../ui-state";
import type { CompanionTextInputs } from "../view-model-types";
import {
  createCompanionTextInputs,
  createEmptyCompanion,
  createEmptyLink,
  createEmptyVehicle,
} from "../view-model-drafts";

export function useReferenceDataState(persistedUiState: PersistedUiState | null) {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [companionDraft, setCompanionDraft] = useState<Companion>(createEmptyCompanion());
  const [editingCompanionId, setEditingCompanionId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleInput>(createEmptyVehicle());
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [linkDraft, setLinkDraft] = useState<ExternalLinkInput>(createEmptyLink());
  const [companionPageTab, setCompanionPageTab] = useState(
    persistedUiState?.companionPageTab ?? "list",
  );
  const [vehiclePageTab, setVehiclePageTab] = useState(
    persistedUiState?.vehiclePageTab ?? "list",
  );
  const [linkPageTab, setLinkPageTab] = useState(
    persistedUiState?.linkPageTab ?? "list",
  );
  const [companionTextInputs, setCompanionTextInputs] = useState<CompanionTextInputs>(
    createCompanionTextInputs(),
  );
  const [vehicleNoteInput, setVehicleNoteInput] = useState("");

  return {
    companions,
    setCompanions,
    companionDraft,
    setCompanionDraft,
    editingCompanionId,
    setEditingCompanionId,
    vehicles,
    setVehicles,
    vehicleDraft,
    setVehicleDraft,
    editingVehicleId,
    setEditingVehicleId,
    links,
    setLinks,
    linkDraft,
    setLinkDraft,
    companionPageTab,
    setCompanionPageTab,
    vehiclePageTab,
    setVehiclePageTab,
    linkPageTab,
    setLinkPageTab,
    companionTextInputs,
    setCompanionTextInputs,
    vehicleNoteInput,
    setVehicleNoteInput,
  };
}
