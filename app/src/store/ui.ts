import { create } from 'zustand';

interface UiState {
  drawerOpen: boolean;
  contextEditorId: number | null | undefined;
  contextMenuOpen: boolean;
  activeSectionByContext: Record<number, string | null>;
  sectionsSheetOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  openContextEditor: (id: number | null) => void;
  closeContextEditor: () => void;
  openContextMenu: () => void;
  closeContextMenu: () => void;
  setActiveSection: (contextId: number, sectionId: string | null) => void;
  openSectionsSheet: () => void;
  closeSectionsSheet: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: false,
  contextEditorId: undefined,
  contextMenuOpen: false,
  activeSectionByContext: {},
  sectionsSheetOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  openContextEditor: (id) => set({ contextEditorId: id, contextMenuOpen: false }),
  closeContextEditor: () => set({ contextEditorId: undefined }),
  openContextMenu: () => set({ contextMenuOpen: true }),
  closeContextMenu: () => set({ contextMenuOpen: false }),
  setActiveSection: (contextId, sectionId) =>
    set((s) => ({
      activeSectionByContext: { ...s.activeSectionByContext, [contextId]: sectionId },
    })),
  openSectionsSheet: () => set({ sectionsSheetOpen: true, contextMenuOpen: false }),
  closeSectionsSheet: () => set({ sectionsSheetOpen: false }),
}));
