import { create } from 'zustand';

interface UiState {
  drawerOpen: boolean;
  contextEditorId: number | null | undefined;
  contextMenuOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  openContextEditor: (id: number | null) => void;
  closeContextEditor: () => void;
  openContextMenu: () => void;
  closeContextMenu: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: false,
  contextEditorId: undefined,
  contextMenuOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  openContextEditor: (id) => set({ contextEditorId: id, contextMenuOpen: false }),
  closeContextEditor: () => set({ contextEditorId: undefined }),
  openContextMenu: () => set({ contextMenuOpen: true }),
  closeContextMenu: () => set({ contextMenuOpen: false }),
}));
