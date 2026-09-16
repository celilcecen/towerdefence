/**
 * English strings, the source of truth for every translation. Other
 * languages must provide exactly this shape (enforced by the `Strings` type),
 * so a missing translation is a compile error, not a blank button.
 */

export interface StoryText {
  readonly name: string;
  /** Shown before the level, one paragraph per entry. */
  readonly brief: readonly string[];
  readonly victory: string;
}

export interface ChapterText {
  readonly name: string;
  readonly subtitle: string;
  readonly intro: string;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const en = {
  locale: "en",
  languageName: "English",
  app: {
    title: "Gridlock",
    subtitle: "The Last Crystal",
    tagline: "Your towers are the walls. Make the monsters walk.",
  },
  home: {
    continue: "Continue",
    campaign: "Campaign",
    classic: "Classic",
    classicHint: "The original 15 waves on The Crossing",
    howToPlay: "How to play",
    settings: "Settings",
    stars: (n: number, total: number) => `★ ${n}/${total}`,
    source: "How it's built · source on GitHub",
  },
  map: {
    title: "Campaign",
    back: "Back",
    locked: "Locked",
    chapter: (n: number) => `Chapter ${n}`,
    levelLabel: (n: number, name: string, stars: number) =>
      `Level ${n}: ${name}, ${stars === 0 ? "not won yet" : plural(stars, "star", "stars")}`,
  },
  briefing: {
    speaker: "Keeper Ilka",
    start: "Defend",
    back: "Map",
    waves: (n: number) => plural(n, "wave", "waves"),
    newThreats: "New threats",
    newTools: "New for you",
  },
  hud: {
    lives: "Lives",
    gold: "Gold",
    wave: "Wave",
    menu: "Menu",
    speed: "Game speed",
    startWave: (n: number) => `Start wave ${n}`,
    callEarly: (bonus: number) => `Call next +${bonus}g`,
    waveRunning: "Wave in progress",
    nextWave: "Next wave",
    waveLabel: (n: number) => `Wave ${n}`,
    boardLabel: "Game board. Select a tower, then tap a tile to build.",
    buildTowers: "Build towers",
    powers: "Powers",
    powerReady: "Ready",
    powerCooldown: (seconds: number) => `${seconds}s`,
    powerAim: "Tap the field to aim. Tap the power again to cancel.",
    hotkey: (key: string) => `Hotkey ${key}`,
  },
  hints: {
    pickTower: "Pick a tower below, then tap a tile to build it.",
    tapTile: "Tap an empty tile to build. Green means OK.",
    startWhenReady: "Enemies will walk around your towers. Start the wave when ready.",
  },
  panel: {
    label: "Selected tower",
    close: "Close tower panel",
    title: (name: string, level: number, max: number) => `${name} · level ${level}/${max}`,
    next: (text: string) => `Next: ${text}`,
    maxed: "Fully upgraded",
    upgrade: (cost: number) => `Upgrade · ${cost}g`,
    maxLevel: "Max level",
    sell: (refund: number) => `Sell · +${refund}g`,
    targeting: "Targeting",
    targets: { first: "First", last: "Last", strongest: "Strongest", closest: "Nearest" },
  },
  stats: {
    damage: (n: number) => `${n} dmg`,
    splash: (n: number) => `${n} splash`,
    beam: (n: number) => `${n} beam`,
    pulse: (n: number, slow: number) => `${n} dmg, slow ${slow}%`,
    chain: (n: number, jumps: number) => `${n} dmg, jumps ${jumps}`,
    range: (n: number) => `range ${n}`,
    rate: (perSecond: string) => `${perSecond}/s`,
    groundOnly: "ground only",
  },
  roles: {
    rapid: "Rapid fire",
    area: "Area damage",
    slows: "Slows nearby",
    longPierce: "Long range, pierces armor",
    pierce: "Pierces armor",
    single: "Single target",
    chain: "Chains between enemies",
    artillery: "Long-range artillery",
  },
  traits: {
    boss: "Boss",
    fast: "Fast",
    slow: "Slow",
    armored: "Armored",
    basic: "Basic",
    flying: "Flies over walls",
    heals: "Heals allies",
    splits: "Splits on death",
    lives: (n: number) => `−${plural(n, "life", "lives")}`,
  },
  pause: {
    title: "Paused",
    resume: "Resume",
    restart: "Restart level",
    settings: "Settings",
    quit: "Quit to map",
    quitClassic: "Quit to menu",
  },
  result: {
    victory: "Victory",
    defeat: "Overrun",
    classicWon: (waves: number, lives: number) =>
      `All ${waves} waves held with ${plural(lives, "life", "lives")} left.`,
    classicLost: (wave: number) => `The maze fell on wave ${wave}.`,
    lost: (wave: number) => `The crystal fell on wave ${wave}. Try a longer maze.`,
    newBest: "New best!",
    best: (text: string) => `Best: ${text}`,
    bestWon: (lives: number) => `victory with ${plural(lives, "life", "lives")}`,
    bestWave: (wave: number) => `reached wave ${wave}`,
    starsLabel: (n: number) => `${plural(n, "star", "stars")} of 3`,
    next: "Next level",
    retry: "Try again",
    map: "Map",
    menu: "Menu",
    playAgain: "Play again",
    campaignComplete: "Campaign complete",
  },
  settings: {
    title: "Settings",
    sfx: "Sound effects",
    music: "Music",
    haptics: "Vibration",
    language: "Language",
    auto: "Device language",
    resetProgress: "Reset campaign progress",
    resetConfirm: "Erase all stars and unlocked levels? This cannot be undone.",
    resetDone: "Progress reset.",
    privacy: "Privacy policy",
    close: "Done",
    version: (v: string) => `Version ${v}`,
  },
  help: {
    title: "How to play",
    lead: "Monsters march from the red rift to your green crystal. Build towers to shoot them, and to wall them into the longest possible route.",
    steps: [
      ["Pick a tower", "from the bar at the bottom."],
      [
        "Tap an empty tile",
        "to build. Towers are walls: enemies walk around them, and you can never seal the path completely.",
      ],
      ["Start the wave.", "Every enemy that reaches the crystal costs lives."],
      [
        "Use powers",
        "when a wave gets out of hand, and call waves early for bonus gold once you are confident.",
      ],
    ] as readonly (readonly [string, string])[],
    towers: "Your towers",
    enemies: "Enemies",
    keys: "1–6 build · Space next wave · U upgrade · S sell · P pause · F speed · Esc cancel",
    close: "Got it",
  },
  speakers: {
    ilka: "Keeper Ilka",
    scout: "Pell, your aide",
    tyrant: "The Rift Tyrant",
  },
  coach: {
    next: "Next",
    gotIt: "Got it",
    letsGo: "Let's go",
    skip: "Skip tutorial",
    offGuide: "Build on the glowing tile.",
    stepOf: (n: number, total: number) => `${n}/${total}`,
    replay: "Replay tutorial and tips",
    replayed: "The tutorial and tips will show again.",
    steps: {
      welcome:
        "Monsters crawl out of the red rift and walk to your green crystal. Every one that gets there costs you lives.",
      pick: "Tap the Bolt tower to pick it.",
      place: "Now tap the glowing tile to build it there.",
      walls:
        "See the arrows bend? Towers are walls. The monsters must walk around them, and a longer road gives your towers more time to shoot.",
      more: "Build two more Bolts on the glowing tiles to stretch the road even further.",
      start: "Ready. Tap Start wave to let them come.",
      watch:
        "Every kill earns gold. Every monster that reaches the crystal costs lives. Clear the wave for a bonus.",
      inspect: "Wave cleared! Now tap one of your towers.",
      upgrade: "Upgrade it: it hits harder and reaches further.",
      finish:
        "That's everything you need. Build a long maze, start waves when you're ready, and keep the crystal safe.",
    },
    tips: {
      flyer:
        "Flyers ignore your walls and head straight for the crystal. Only firepower stops them, so put towers along their line.",
      healer:
        "A Mender heals every monster near it. Kill it first: set a tower to Strongest, or drop a power on it.",
      splitter: "Broods burst into broodlings when they die. Splash and chain towers clear the swarm.",
      boss: "A boss is coming. If it reaches the crystal you lose 20 lives at once. Keep it walking and hit it with everything.",
      power: "Your power is ready. Tap it, then tap the field. Powers recharge only while a wave runs.",
      early:
        "Every monster in this wave is out. Call the next wave now for bonus gold, if you're confident.",
    },
  },
  dialogue: {
    "c1-crossing": {
      first: "Here they come! Scouts only. Let them walk the long way.",
      brute: "That big one is a Brute. Armor shrugs off small hits, so keep Cannons on it.",
      last: "Last wave. Hold this and the Crossing is ours!",
    },
    "c1-fords": {
      fords: "Both fords at once. Where the roads meet, a Frost tower buys you precious seconds.",
      meteor: "They're bunching up. That's what the Meteor is for!",
      last: "The river is almost clear. One more push.",
    },
    "c1-mill": {
      mill: "The mill road is winding already. Let's make it worse for them.",
      warden: "Little builder. My Warden will grind your walls to dust.",
    },
    "c2-lake": {
      wisps: "Wisps over the ice! They're flying straight over the lake!",
      cold: "The cold will not save you. Nothing in this world will.",
    },
    "c2-pass": {
      mender: "See the green glow? A Mender. Nothing dies near it unless you kill it first.",
      focus: "Focus the healers, and the rest will fall.",
    },
    "c2-gate": {
      harriers: "Armored wings! Arcs and Spires, now!",
      gate: "Every gate you hold only makes the fall louder.",
      freeze: "Two Wardens. If it goes wrong, Frostbind the field.",
    },
    "c3-cinder": {
      brood: "Broods! Pop one and a swarm pours out. Splash them!",
      forges: "The forges are still hot. The Mortars will carry our anger across the field.",
    },
    "c3-molten": {
      heat: "Watch your step, the ground here is molten. For them too.",
      burn: "Burn, builder. The Ashlands are mine.",
    },
    "c3-keep": {
      keep: "The old walls funnel them to one gate. Make that gate a grave.",
      walls: "Walls? I have torn down a thousand walls.",
      hold: "This is it for the Ashlands. Hold!",
    },
    "c4-edge": {
      welcome: "So the little builder comes to my doorstep. Welcome to the edge of everything.",
      split: "Two crystals, two roads each. Don't let either side starve.",
    },
    "c4-spire": {
      center: "They're coming from both sides. Build a fortress around the crystal!",
      spire: "You cannot wall in the whole world.",
    },
    "c4-heart": {
      arrive: "Enough. I will take the last crystal myself.",
      believe: "Gridwright. Every maze you built led here. I believe in you.",
      final: "Kneel before the Rift!",
    },
  } as Readonly<Record<string, Readonly<Record<string, string>>>>,
  ending: {
    title: "The Rift is closed",
    text: "The sky knit itself shut over the dead plain, and one by one the crystals of the Greenreach began to shine again. They say the roads there still wind in strange patterns, and that children build little mazes of pebbles in the dust, waiting for the Gridwright to come home.",
    credits: "Thank you for playing.",
    continue: "Continue",
  },
  errors: {
    "out-of-bounds": "That's off the board.",
    "not-buildable": "You can't build there.",
    "occupied-by-enemy": "An enemy is in the way.",
    "blocks-path": "That would seal the maze. Enemies always need a way through.",
    "game-over": "The game is over.",
    "unknown-tower-type": "That tower type doesn't exist.",
    "unknown-tower": "That tower is gone.",
    "insufficient-gold": "Not enough gold.",
    "max-level": "Already fully upgraded.",
    "invalid-targeting": "Unknown targeting mode.",
    "wave-in-progress": "Wait until every enemy of this wave has appeared.",
    "no-more-waves": "That was the last wave.",
    "unknown-power": "That power isn't available here.",
    "power-not-ready": "That power is still recharging.",
    "no-wave-active": "Powers can only be used during a wave.",
  },
  towers: {
    bolt: { name: "Bolt", summary: "Cheap and quick. The backbone of every maze." },
    cannon: {
      name: "Cannon",
      summary: "Slow shells that damage everything they land on. Cannot hit flyers.",
    },
    frost: { name: "Frost", summary: "Pulses cold around itself, slowing everything nearby." },
    spire: { name: "Spire", summary: "Long-range beam that punches through armor." },
    arc: { name: "Arc", summary: "Lightning that jumps between packed enemies." },
    mortar: {
      name: "Mortar",
      summary: "Lobs heavy shells across the whole field. Cannot hit flyers.",
    },
  } as Readonly<Record<string, { readonly name: string; readonly summary: string }>>,
  enemies: {
    runner: "Runner",
    grunt: "Grunt",
    brute: "Brute",
    warden: "Warden",
    wisp: "Wisp",
    mender: "Mender",
    harrier: "Harrier",
    brood: "Brood",
    broodling: "Broodling",
    tyrant: "Rift Tyrant",
  } as Readonly<Record<string, string>>,
  powers: {
    meteor: { name: "Meteor", summary: "Call down a meteor on any spot. Hits ground and air." },
    frostbind: { name: "Frostbind", summary: "Freeze the whole field for a few seconds." },
  } as Readonly<Record<string, { readonly name: string; readonly summary: string }>>,
  chapters: {
    greenreach: {
      name: "The Greenreach",
      subtitle: "The Rift opens",
      intro:
        "Last night the sky tore open above the Greenreach. By dawn the Hollow were marching, and every village crystal between here and the capital is a meal to them.",
    },
    frostmarch: {
      name: "The Frostmarch",
      subtitle: "Wings over the ice",
      intro:
        "Beyond the mountains the Frostmarch lies silent under snow. The Hollow have followed us here, and they have learned to fly.",
    },
    ashlands: {
      name: "The Ashlands",
      subtitle: "The burning road",
      intro:
        "The Ashlands were a realm of forges once. Now the Hollow breed in the cinders, and their broods grow faster than we can burn them.",
    },
    rift: {
      name: "The Rift",
      subtitle: "Close the wound",
      intro:
        "The wound in the sky hangs over a dead plain. Every Hollow ever born crawls out of it, and at its heart waits the Tyrant.",
    },
  } as Readonly<Record<string, ChapterText>>,
  levels: {
    "c1-crossing": {
      name: "The Crossing",
      brief: [
        "You made it, Gridwright. The Hollow always take the shortest road to our crystal.",
        "So don't give them a short road. Every tower you build is a wall. Make them walk, and shoot them while they do.",
      ],
      victory: "The Crossing holds. But those were only their scouts.",
    },
    "c1-fords": {
      name: "Twin Fords",
      brief: [
        "They are wading through both fords of the river at once.",
        "The capital sent Frost towers: put them where the paths meet. And you have a Meteor now. Tap it, then tap the field.",
      ],
      victory: "The river runs clear again. Something huge was seen on the road to the old mill.",
    },
    "c1-mill": {
      name: "Old Mill Road",
      brief: [
        "A Warden leads this host. It is armored, it is slow, and if it reaches the crystal we lose twenty lives at once.",
        "Spire towers punch through armor. Build them deep in your maze and keep that monster walking.",
      ],
      victory: "The Warden has fallen. There was ice in its claws. The Hollow came from the north.",
    },
    "c2-lake": {
      name: "Frozen Lake",
      brief: [
        "Wisps. They fly straight over walls and water, so your maze will not slow them. Only firepower will.",
        "Watch the line from their rift to the crystal. Arc towers chain lightning through anything packed together.",
      ],
      victory: "The lake is quiet. Up in the pass, something is keeping the Hollow alive.",
    },
    "c2-pass": {
      name: "Pale Pass",
      brief: [
        "Menders walk with the horde and heal every Hollow near them.",
        "Kill them first. Set a tower to Strongest or Nearest, and save your Meteor for a cluster around a Mender.",
      ],
      victory: "The pass is ours. Only the Glacier Gate stands between the horde and the north.",
    },
    "c2-gate": {
      name: "Glacier Gate",
      brief: [
        "Harriers: armored flyers. Behind them, two Wardens are coming for the gate.",
        "The mountain keepers gave us the Frostbind. It freezes the whole field. Save it for the moment everything goes wrong.",
      ],
      victory: "The gate holds. To the east, the glaciers bleed red. The Ashlands are burning.",
    },
    "c3-cinder": {
      name: "Cinder Fields",
      brief: [
        "Broods burst into a swarm of broodlings when they die. Splash damage clears the swarm.",
        "The old forges still work: Mortars reach across the whole field. They cannot hit flyers, so keep your Arcs.",
      ],
      victory: "The fields are ash again, and only ash. The horde is pouring through the lava gap.",
    },
    "c3-molten": {
      name: "Molten Crossing",
      brief: [
        "They come through the corner of the crossing, and the road to the crystal is long.",
        "Make it longer. Every step they take on hot stone is a step closer to dying.",
      ],
      victory: "The crossing is cooling. Our last stronghold in the Ashlands is under siege.",
    },
    "c3-keep": {
      name: "Burning Keep",
      brief: [
        "The old keep still stands around its crystal. Its walls funnel the horde to a single gate.",
        "Hold the gate, and the road to the Rift is finally open.",
      ],
      victory: "We drove them back to the Rift itself. It ends there, one way or another.",
    },
    "c4-edge": {
      name: "Rift's Edge",
      brief: [
        "Two rifts, two crystals, four roads. The horde will split, and so must you.",
        "Trust your mazes. You have built nothing but mazes for weeks.",
      ],
      victory:
        "The edge is held. The Hollow are gathering around the spire at the heart of the plain.",
    },
    "c4-spire": {
      name: "Hollow Spire",
      brief: [
        "Our crystal sits in the middle of the plain, and they come from both sides.",
        "Build a fortress. Every road leads to the centre now.",
      ],
      victory:
        "The spire is silent. There is only the heart of the Rift left, and what lives in it.",
    },
    "c4-heart": {
      name: "Heart of the Rift",
      brief: [
        "This is it, Gridwright. The Rift Tyrant is coming for the last crystal.",
        "When it falls it sheds four Brutes, so be ready. Close the Rift, and the Greenreach will sing your name.",
      ],
      victory: "The Rift is closing. The sky is healing. Thank you, Gridwright. Rest now.",
    },
  } as Readonly<Record<string, StoryText>>,
};

export type Strings = typeof en;
