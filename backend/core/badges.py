"""Hardcoded badge definitions and level computation for the party badge system.

Badges are awarded by the chat analyser at the end of each party (one per user
per party) and persist on the User across all conversations as cumulative counts.
Levels follow triangular numbers: reaching Level N requires N*(N+1)/2 total earnings.
"""

BADGES: dict[str, str] = {
    "Party Animal": "🦁",
    "Photographer of the Night": "📸",
    "Storyteller": "🎤",
    "Dance Machine": "💃",
    "SuperStar": "🌟",
    "Picasso": "🎨",
    "Night Owl": "🦉",
    "Early Bird": "🐣",
    "Silent Watcher": "👻",
    "Hype Man": "🔥",
    "Voice of the Night": "🎙️",
    "Trendsetter": "🚀",
    "Diamond of the Night": "💎",
    "Casanova": "😈",
    "Three Sheets": "🥴",
}

BADGE_DESCRIPTIONS: dict[str, str] = {
    "Party Animal": "Most active presence throughout the night — sent the most overall",
    "Photographer of the Night": "Most photos/videos sent",
    "Storyteller": "Richest text content, longest and most detailed messages",
    "Dance Machine": "High energy, consistent presence all night long",
    "SuperStar": "Most reactions and votes received from others",
    "Picasso": "Most drawings sent",
    "Night Owl": "Still active the latest in the night",
    "Early Bird": "First person to send a message",
    "Silent Watcher": "Joined but barely sent anything — the lurker",
    "Hype Man": "Most emoji reactions given to others",
    "Voice of the Night": "Most voice messages sent",
    "Trendsetter": "First person to receive reactions from others",
    "Diamond of the Night": "Outstanding standout — reserved for truly exceptional moments",
    "Casanova": "Most flirtatious content — suggestive messages, drawings, energy",
    "Three Sheets": "Messages clearly showing the progression of the night — bravely incoherent",
}


def level_from_count(count: int) -> int:
    """Compute badge level from cumulative earn count.

    Level N is reached when count >= N*(N+1)/2 (triangular numbers):
    1 -> L1, 3 -> L2, 6 -> L3, 10 -> L4, 15 -> L5, ...
    """
    if count <= 0:
        return 0
    level = 0
    while (level + 1) * (level + 2) // 2 <= count:
        level += 1
    return level


def badges_with_levels(badges: dict[str, int]) -> dict[str, dict]:
    """Expand a badges count dict into {name: {emoji, count, level, description}}."""
    return {
        name: {
            "emoji": BADGES.get(name, "🏅"),
            "count": count,
            "level": level_from_count(count),
            "description": BADGE_DESCRIPTIONS.get(name, ""),
        }
        for name, count in badges.items()
        if count > 0
    }
