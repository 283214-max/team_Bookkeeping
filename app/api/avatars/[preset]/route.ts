const avatars: Record<
  string,
  { animal: string; label: string; bg: string; fg: string }
> = {
  rat: { animal: "Rat", label: "R", bg: "#eef6ff", fg: "#1d5fa7" },
  ox: { animal: "Ox", label: "O", bg: "#f6f2ea", fg: "#7a4b20" },
  tiger: { animal: "Tiger", label: "T", bg: "#fff1e6", fg: "#b94700" },
  rabbit: { animal: "Rabbit", label: "R", bg: "#fff0f6", fg: "#b31b66" },
  dragon: { animal: "Dragon", label: "D", bg: "#edf8ef", fg: "#1f7a3f" },
  snake: { animal: "Snake", label: "S", bg: "#f0f8e8", fg: "#4e7d18" },
  horse: { animal: "Horse", label: "H", bg: "#f8f0e8", fg: "#8a4a20" },
  goat: { animal: "Goat", label: "G", bg: "#f5f5f7", fg: "#5d6470" },
  monkey: { animal: "Monkey", label: "M", bg: "#fff7dc", fg: "#9a6b00" },
  rooster: { animal: "Rooster", label: "R", bg: "#fff0ed", fg: "#bd2f21" },
  dog: { animal: "Dog", label: "D", bg: "#edf4ff", fg: "#3457d5" },
  pig: { animal: "Pig", label: "P", bg: "#fff0f3", fg: "#bd3155" },
};

type RouteContext = { params: Promise<{ preset: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { preset } = await context.params;
  const avatar = avatars[preset] ?? avatars.dragon;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${avatar.animal} avatar">
  <rect width="160" height="160" rx="80" fill="${avatar.bg}"/>
  <circle cx="80" cy="82" r="48" fill="#fff" opacity=".9"/>
  <circle cx="64" cy="72" r="6" fill="${avatar.fg}"/>
  <circle cx="96" cy="72" r="6" fill="${avatar.fg}"/>
  <path d="M60 98c11 12 29 12 40 0" fill="none" stroke="${avatar.fg}" stroke-width="8" stroke-linecap="round"/>
  <text x="80" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="${avatar.fg}">${avatar.label}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
}
