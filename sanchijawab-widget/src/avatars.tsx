import type { ComponentChildren } from "preact";

// Keep ids/shapes in sync with sanchijawab-admin/lib/avatars.tsx — the
// widget just needs to render whatever preset the dashboard picked.

interface AvatarPreset {
  id: string;
  color: string;
  shape: ComponentChildren;
}

const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "orbit",
    color: "#3D46C9",
    shape: (
      <g fill="none" stroke="#fff" stroke-width="1.6">
        <circle cx="12" cy="12" r="6.5" />
        <circle cx="12" cy="12" r="1.6" fill="#fff" stroke="none" />
      </g>
    ),
  },
  {
    id: "spark",
    color: "#6C5CE7",
    shape: <path d="M13 3 6 13h4.5L10 21l7.5-11H13z" fill="#fff" />,
  },
  {
    id: "pulse",
    color: "#00B4A6",
    shape: (
      <g fill="#fff">
        <rect x="6" y="9" width="2.6" height="6" rx="1.3" />
        <rect x="10.7" y="5.5" width="2.6" height="13" rx="1.3" />
        <rect x="15.4" y="9" width="2.6" height="6" rx="1.3" />
      </g>
    ),
  },
  {
    id: "nova",
    color: "#9B5DE5",
    shape: <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" fill="#fff" />,
  },
  {
    id: "ember",
    color: "#F2622E",
    shape: (
      <path
        d="M12 3c1 3-2 4-2 7a3 3 0 1 0 6 .3C17 8 14.5 7 14.5 4c2 1.5 4.5 4.8 4.5 8.2A7 7 0 1 1 7 12c0-3.5 2.6-6 5-9z"
        fill="#fff"
      />
    ),
  },
  {
    id: "leaf",
    color: "#1B9C63",
    shape: (
      <g>
        <path d="M18 6c-7 0-11 4-11 11 7 0 11-4 11-11z" fill="#fff" />
        <path d="M7.8 17.2 16.5 7.5" stroke="#1B9C63" stroke-width="1.3" fill="none" />
      </g>
    ),
  },
  {
    id: "beacon",
    color: "#E84393",
    shape: (
      <g fill="none" stroke="#fff" stroke-width="1.6">
        <circle cx="12" cy="12" r="2" fill="#fff" stroke="none" />
        <circle cx="12" cy="12" r="5" opacity="0.85" />
        <circle cx="12" cy="12" r="8" opacity="0.5" />
      </g>
    ),
  },
  {
    id: "cube",
    color: "#576574",
    shape: (
      <g fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round">
        <path d="M12 4 19 8v8l-7 4-7-4V8z" />
        <path d="M12 4v8M12 12 5 8M12 12l7-4" />
      </g>
    ),
  },
];

function avatarById(id: string): AvatarPreset {
  return AVATAR_PRESETS.find((a) => a.id === id) || AVATAR_PRESETS[0];
}

export function BotAvatar({ avatarId, size = 32 }: { avatarId: string; size?: number }) {
  const preset = avatarById(avatarId);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" class="sj-avatar">
      <circle cx="12" cy="12" r="12" fill={preset.color} />
      {preset.shape}
    </svg>
  );
}
