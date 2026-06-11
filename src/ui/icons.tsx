// Icon set per UI standard §6: 20px grid, 1.5px stroke, rounded caps/joins.

import type { ReactNode } from 'react';

function I({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const UndoIcon = () => (
  <I>
    <path d="M7.5 4.5 3.5 8.5l4 4" />
    <path d="M3.5 8.5h8a4.5 4.5 0 0 1 0 9H10" />
  </I>
);
export const RedoIcon = () => (
  <I>
    <path d="M12.5 4.5l4 4-4 4" />
    <path d="M16.5 8.5h-8a4.5 4.5 0 0 0 0 9H10" />
  </I>
);
export const FolderIcon = () => (
  <I>
    <path d="M2.5 5.5a1 1 0 0 1 1-1h4l2 2h6.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-12.5a1 1 0 0 1-1-1z" />
  </I>
);
export const DownloadIcon = () => (
  <I>
    <path d="M10 3v9" />
    <path d="M6.5 9.5 10 13l3.5-3.5" />
    <path d="M4 16.5h12" />
  </I>
);
export const TrashIcon = () => (
  <I>
    <path d="M4 5.5h12" />
    <path d="M8 5.5V4h4v1.5" />
    <path d="M6 5.5 6.8 16h6.4L14 5.5" />
  </I>
);
export const CopyIcon = () => (
  <I>
    <rect x="7" y="7" width="9" height="9" rx="1.5" />
    <path d="M4.5 12.5V5a1 1 0 0 1 1-1H13" />
  </I>
);
export const WarningIcon = () => (
  <I>
    <path d="M10 3.5 17.5 16.5h-15z" />
    <path d="M10 8.5v3.5" />
    <path d="M10 14.4v.1" />
  </I>
);
export const CheckIcon = () => (
  <I>
    <path d="M4 10.5l4 4 8-9" />
  </I>
);
export const ChevronDownIcon = () => (
  <I>
    <path d="M5 7.5l5 5 5-5" />
  </I>
);
export const ChevronRightIcon = () => (
  <I>
    <path d="M7.5 5l5 5-5 5" />
  </I>
);
export const SearchIcon = () => (
  <I>
    <circle cx="8.5" cy="8.5" r="5" />
    <path d="M12.5 12.5 17 17" />
  </I>
);
export const SnapIcon = () => (
  <I>
    <circle cx="10" cy="10" r="2" />
    <path d="M10 2.5v3.5M10 14v3.5M2.5 10H6M14 10h3.5" />
  </I>
);
export const FrameIcon = () => (
  <I>
    <path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7" />
    <path d="M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7" />
    <path d="M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13" />
    <path d="M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13" />
  </I>
);
export const RotateIcon = () => (
  <I>
    <path d="M16 10a6 6 0 1 1-2-4.47" />
    <path d="M16 3.5V6h-2.5" />
  </I>
);
export const CloseIcon = () => (
  <I>
    <path d="M5 5l10 10M15 5 5 15" />
  </I>
);
export const ListIcon = () => (
  <I>
    <path d="M7 5h9M7 10h9M7 15h9" />
    <path d="M4 5h.01M4 10h.01M4 15h.01" />
  </I>
);
export const LibraryIcon = () => (
  <I>
    <path d="M10 3l6 3.5v7L10 17l-6-3.5v-7z" />
    <path d="M4 6.5l6 3.5 6-3.5" />
    <path d="M10 10v7" />
  </I>
);
export const PlusIcon = () => (
  <I>
    <path d="M10 4v12M4 10h12" />
  </I>
);
export const MinusIcon = () => (
  <I>
    <path d="M4 10h12" />
  </I>
);
export const PanelLeftIcon = () => (
  <I>
    <rect x="3" y="4" width="14" height="12" rx="1.5" />
    <path d="M8 4v12" />
  </I>
);
export const PanelRightIcon = () => (
  <I>
    <rect x="3" y="4" width="14" height="12" rx="1.5" />
    <path d="M12 4v12" />
  </I>
);
