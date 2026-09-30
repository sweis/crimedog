// Content tables. Everything the generators draw from lives here so it can be
// probed by tests (see tests/content.test.mjs).

export const SKILLS = ['sneak', 'tech', 'muscle', 'charm', 'wheels', 'locks', 'disguise', 'agility', 'aim', 'nose'];

export const SKILL_INFO = {
  sneak: { label: 'Sneak', icon: '🐾', rumour: 'moves quieter than a slipper' },
  tech: { label: 'Tech', icon: '💻', rumour: 'is a wizard with wires' },
  muscle: { label: 'Muscle', icon: '💪', rumour: 'can open a door without the handle' },
  charm: { label: 'Charm', icon: '🎩', rumour: 'could talk a guard out of his own lunch' },
  wheels: { label: 'Wheels', icon: '🚗', rumour: 'drives like the streets owe him money' },
  locks: { label: 'Locks', icon: '🔐', rumour: 'has never met a lock he liked' },
  disguise: { label: 'Disguise', icon: '🥸', rumour: 'changes faces like other folk change collars' },
  agility: { label: 'Agility', icon: '🤸', rumour: 'goes up drainpipes like it\'s a staircase' },
  aim: { label: 'Aim', icon: '🎯', rumour: 'never misses with a tennis ball' },
  nose: { label: 'Nose', icon: '👃', rumour: 'can sniff out a copper at forty paces' },
};

// 100 talents. [id, name, skill, bonus, blurb, special?]
// Specials hook into the sim: night, clean, intel, loud, carry, hothead, nerve,
// escape, cool, lucky, lookout, gossip, fence, sniff, wild.
const T = [
  // Sneak
  ['shadow', 'Shadow Walker', 'sneak', 2, 'Moves like a rumour.'],
  ['softpaws', 'Soft Paws', 'sneak', 1, 'Carpet-quiet on any floor.'],
  ['hedge', 'Hedge Creeper', 'sneak', 1, 'Knows every hedge in the borough by first name.'],
  ['tiptoe', 'Tiptoe Terror', 'sneak', 1, 'Nobody hears him coming. Nobody.'],
  ['nightowl', 'Night Owl', 'sneak', 1, 'Sharper after midnight.', 'night'],
  ['ghost', 'Ghost of Bonechapel', 'sneak', 2, 'Leaves nothing behind. Not even a hair.', 'clean'],
  ['crawl', 'Crawlspace Crawler', 'sneak', 1, 'Fits where he really shouldn\'t.'],
  ['pant', 'Silent Panting', 'sneak', 1, 'Years of training. Barely a wheeze.'],
  ['rug', 'Blends with Rugs', 'sneak', 1, 'Lies flat. Looks like a rug. Works every time.'],
  ['cardboard', 'Cardboard Box Expert', 'sneak', 2, 'A box is a lifestyle.'],
  // Tech
  ['alarmwhisper', 'Alarm Whisperer', 'tech', 2, 'Alarms go quiet when he talks to them.'],
  ['keyboard', 'Keyboard Paws', 'tech', 1, 'Types forty words a minute. Mostly the letter W.'],
  ['loop', 'Camera Looper', 'tech', 2, 'Guards watch the same empty corridor for hours.'],
  ['wirechew', 'Wire Chewer', 'tech', 1, 'Old school. Very old school.'],
  ['codesniff', 'Code Sniffer', 'tech', 1, 'Smells a password on a keypad.'],
  ['radio', 'Radio Ham', 'tech', 1, 'Listens in on the Old Bill\'s radio.', 'intel'],
  ['fusebox', 'Fuse Box Fiddler', 'tech', 1, 'Lights out whenever he likes.'],
  ['dish', 'Satellite Dish Tuner', 'tech', 1, 'Gets forty channels and your bank PIN.'],
  ['lapdog', 'Laptop Lapdog', 'tech', 2, 'Never seen without the laptop. Sleeps on it.'],
  ['remote', 'Remote Retriever', 'tech', 1, 'Can fetch any signal.'],
  // Muscle
  ['bonecrush', 'Bone Crusher', 'muscle', 2, 'Has a bite that could crack a safe.'],
  ['tug', 'Tug-of-War Champion', 'muscle', 1, 'Undefeated. Pulled a door off its hinges once.'],
  ['doorbust', 'Door Buster', 'muscle', 2, 'Doors are merely suggestions.', 'loud'],
  ['headbutt', 'Headbutt', 'muscle', 1, 'Hard head. Soft heart. Hard head, mostly.'],
  ['lifter', 'Heavy Lifter', 'muscle', 1, 'Carries twice the swag.', 'carry'],
  ['brawler', 'Brawler', 'muscle', 1, 'Starts fights. Finishes them too.', 'hothead'],
  ['bouncer', 'Bouncer\'s Build', 'muscle', 1, 'Stands in doorways professionally.'],
  ['ironjaw', 'Iron Jaw', 'muscle', 1, 'Takes a hit, keeps his head.', 'nerve'],
  ['tackle', 'Flying Tackle', 'muscle', 1, 'Launches first, asks later.'],
  ['gate', 'Gate Rattler', 'muscle', 1, 'No gate has survived him.'],
  // Charm
  ['puppyeyes', 'Puppy Eyes', 'charm', 2, 'Nobody has ever said no. Nobody.'],
  ['silver', 'Silver Tongue', 'charm', 2, 'Could sell a bath to a... well, to anyone.'],
  ['vowels', 'Posh Vowels', 'charm', 1, 'Sounds like old money. Is not old money.'],
  ['gab', 'Gift of the Gab', 'charm', 1, 'Talks. And talks. And somehow you agree.'],
  ['bellyrub', 'Belly-Rub Diplomacy', 'charm', 1, 'Rolls over at exactly the right moment.'],
  ['wit', 'Waggish Wit', 'charm', 1, 'Guards laugh. Guards forget to check the bag.'],
  ['conartist', 'Con Artist', 'charm', 2, 'Has been three different dukes this month.'],
  ['sweet', 'Sweet Talker', 'charm', 1, 'Honey-voiced. Honey-motivated.'],
  ['flatter', 'Shameless Flatterer', 'charm', 1, '"What a lovely uniform, officer."'],
  ['teabiscuits', 'Tea-and-Biscuits Manner', 'charm', 1, 'Calm as a Sunday afternoon.', 'cool'],
  // Wheels
  ['getaway', 'Getaway Driver', 'wheels', 2, 'Engine running. Always.', 'escape'],
  ['handbrake', 'Handbrake Turn', 'wheels', 1, 'Corners are optional.'],
  ['headout', 'Head Out the Window', 'wheels', 1, 'Drives best with the window down. Always.'],
  ['alleys', 'Back-Alley Map', 'wheels', 1, 'Knows the shortcut. And the shortcut\'s shortcut.'],
  ['moped', 'Moped Maestro', 'wheels', 1, 'Two wheels, no fear.'],
  ['barge', 'Canal Barge Pilot', 'wheels', 1, 'Four miles an hour, zero suspicion.'],
  ['knowledge', 'Taxi Knowledge', 'wheels', 1, 'Knows every street. Every. Single. One.'],
  ['reverse', 'Reverse Parker', 'wheels', 1, 'Parallel parks at speed. Showing off, mostly.'],
  ['rally', 'Rally Champion', 'wheels', 2, 'Once won a rally backwards.'],
  ['chase', 'Loves a Chase', 'wheels', 1, 'Gets calmer the faster it goes.', 'cool'],
  // Locks
  ['safecracker', 'Safe Cracker', 'locks', 2, 'Hasn\'t met a safe he couldn\'t sweet-talk.'],
  ['picklock', 'Picklock', 'locks', 1, 'Carries picks in his collar.'],
  ['tumbler', 'Tumbler Ears', 'locks', 2, 'Hears the pins drop from across the room.'],
  ['combo', 'Combination Sniffer', 'locks', 1, 'The numbers smell different. Trust him.'],
  ['skeleton', 'Skeleton Key', 'locks', 1, 'One key. Every door.'],
  ['bonekey', 'Bone Key', 'locks', 1, 'Carved it himself. Don\'t ask from what.'],
  ['padlock', 'Padlock Popper', 'locks', 1, 'Pop. Pop. Pop.'],
  ['vaultw', 'Vault Whisperer', 'locks', 2, 'The big doors open up to him.'],
  ['depositbox', 'Deposit Box Dabbler', 'locks', 1, 'Rows of little doors. Bliss.'],
  ['keycard', 'Keycard Cloner', 'locks', 1, 'Brushes past you. Now he\'s you.'],
  // Disguise
  ['master', 'Master of Disguise', 'disguise', 2, 'His own mother walks past him.'],
  ['moustache', 'Fake Moustache', 'disguise', 1, 'Just the one. It\'s very convincing.'],
  ['accent', 'Accent Chameleon', 'disguise', 1, 'Posh at breakfast, street by teatime.'],
  ['costume', 'Costume Trunk', 'disguise', 1, 'Has a uniform for every occasion.'],
  ['uniform', 'Uniform Collector', 'disguise', 1, 'Nobody questions a clipboard.'],
  ['hindlegs', 'Walks on Hind Legs', 'disguise', 2, 'For hours, if needed.'],
  ['groomer', 'Groomer\'s Touch', 'disguise', 1, 'A quick trim and he\'s somebody else.'],
  ['trenchcoat', 'Three in a Trench Coat', 'disguise', 1, 'Has two mates on call for tall disguises.'],
  ['facecrowd', 'Face in the Crowd', 'disguise', 1, 'Witnesses can\'t describe him.', 'clean'],
  ['butler', 'Butler Impression', 'disguise', 1, '"Will that be all, sir?"'],
  // Agility
  ['rooftop', 'Rooftop Runner', 'agility', 2, 'The city\'s better from above.'],
  ['laserdance', 'Laser Dancer', 'agility', 2, 'Treats laser grids like a disco.'],
  ['catburglar', 'Cat Burglar', 'agility', 1, 'Hates the name. Loves the work.'],
  ['drainpipe', 'Drainpipe Climber', 'agility', 1, 'Up the pipe, in the window, kettle on.'],
  ['frisbee', 'Frisbee Leap', 'agility', 1, 'Can catch anything mid-air.'],
  ['tightrope', 'Tightrope Walker', 'agility', 1, 'Ran away from the circus. Kept the balance.'],
  ['catflap', 'Cat-Flap Squeezer', 'agility', 1, 'Gets in through the smallest gap. Undignified.'],
  ['parkour', 'Parkour', 'agility', 1, 'Never takes the stairs. Never gets caught.', 'escape'],
  ['doublejump', 'Double Jump', 'agility', 1, 'Physics says no. He says yes.'],
  ['zoomies', 'The Zoomies', 'agility', 2, 'Sudden bursts of pure speed. Unpredictable.', 'wild'],
  // Aim
  ['crackshot', 'Crack Shot', 'aim', 2, 'Hits a lens at fifty yards.'],
  ['tennisball', 'Tennis Ball Sniper', 'aim', 2, 'Fuzzy green death.'],
  ['slingshot', 'Slingshot', 'aim', 1, 'Pocket artillery.'],
  ['dart', 'Dart Master', 'aim', 1, 'Pub darts champion three years running.'],
  ['stick', 'Stick Thrower', 'aim', 1, 'Can hit a lamppost from two hundred yards.'],
  ['paintball', 'Paintball Pro', 'aim', 1, 'Blinds cameras with a single splat.'],
  ['flashbulb', 'Flash Bulb', 'aim', 1, 'Nobody sees anything for ten seconds.'],
  ['waterpistol', 'Water Pistol', 'aim', 1, 'Shorts out a fuse box from across the road.'],
  ['trickshot', 'Trick Shot', 'aim', 1, 'Bounces it off three walls. Somehow works.', 'lucky'],
  ['steady', 'Steady Paw', 'aim', 1, 'Never shakes. Never blinks.', 'cool'],
  // Nose
  ['bloodhound', 'Bloodhound Nose', 'nose', 2, 'Smells a guard shift change a street away.', 'intel'],
  ['keenears', 'Keen Ears', 'nose', 1, 'Hears footsteps before they\'re stepped.'],
  ['lookout', 'Lookout', 'nose', 1, 'Barks the warning just in time.', 'lookout'],
  ['mapmemory', 'Map Memory', 'nose', 1, 'Sees a floorplan once, knows it forever.'],
  ['casing', 'Casing Expert', 'nose', 2, 'Clocks every camera, guard and exit in one walk-by.', 'intel'],
  ['gossip', 'Gossip Hound', 'nose', 1, 'Hears everything down the pub.', 'gossip'],
  ['peoplewatch', 'People Watcher', 'nose', 1, 'Knows who\'s lying by the tail... by the tell.'],
  ['papertrail', 'Knows a Bloke', 'nose', 1, 'Always knows a buyer who pays top whack.', 'fence'],
  ['squirrelspot', 'Squirrel Spotter', 'nose', 1, 'Nothing moves without him clocking it.'],
  ['snifftest', 'Sniff Test', 'nose', 1, 'Can sniff out a copper in plain clothes.', 'sniff'],
];
export const TALENTS = Object.fromEntries(
  T.map(([id, name, skill, bonus, blurb, special]) => [id, { id, name, skill, bonus, blurb, special: special || null }]),
);

// Quirks: hidden personality traits discovered through experience or surveillance.
export const QUIRKS = {
  goodboy: { name: 'Good Boy', good: true, blurb: 'Loyal to the end. Would never do a runner.' },
  nevergrass: { name: 'Never Grasses', good: true, blurb: 'Won\'t say a word under interrogation.' },
  looselips: { name: 'Loose Lips', good: false, blurb: 'Talks. To anyone. About everything.' },
  mumbles: { name: 'Mumbles', good: null, blurb: 'Nobody can understand a word he says. Including the police.' },
  squirrel: { name: 'Squirrel!', good: false, blurb: 'Easily distracted. By anything with a fluffy tail.' },
  sheds: { name: 'Sheds Everywhere', good: false, blurb: 'Leaves fur on every surface. Forensics love him.' },
  eatsevidence: { name: 'Eats the Evidence', good: true, blurb: 'Swallows anything incriminating. Anything.' },
  nervous: { name: 'Nervous Widdler', good: false, blurb: 'Goes to pieces when the alarms start.' },
  steel: { name: 'Nerves of Steel', good: true, blurb: 'Calmer the louder it gets.' },
  greedy: { name: 'Treat Motivated', good: false, blurb: 'Always wants a bigger slice.' },
  pack: { name: 'Pack Animal', good: null, blurb: 'Works best with his own lot.' },
  lonewolf: { name: 'Lone Wolf', good: null, blurb: 'Works best alone. Hates a crowd.' },
  postmen: { name: 'Barks at Postmen', good: false, blurb: 'Can\'t stand a uniform. Gets loud.' },
  lucky: { name: 'Born Lucky', good: true, blurb: 'Things just go his way. Once a job, anyway.' },
  napper: { name: 'Needs a Nap', good: false, blurb: 'Flags badly towards the end of a long night.' },
  glory: { name: 'Glory Hound', good: null, blurb: 'Brilliant when showing off. Leaves a calling card.' },
};

export const BREEDS = {
  shepherd: { label: 'German Shepherd', faction: 'ze', ears: 'pointy', snout: 1.15, coats: ['#b8793a', '#a86c32'], mask: '#2b1e16', bias: ['tech', 'muscle', 'nose'] },
  doberman: { label: 'Doberman', faction: 'ze', ears: 'pointy', snout: 1.2, coats: ['#221c19', '#3a2a22'], mask: '#b06a32', maskStyle: 'points', bias: ['muscle', 'aim', 'tech'] },
  bulldog: { label: 'Bulldog', faction: 'firm', ears: 'rose', snout: 0.55, jowls: true, coats: ['#d8b38a', '#efe2cf', '#c69064'], mask: '#fff5e8', bias: ['muscle', 'locks'] },
  staffie: { label: 'Staffie', faction: 'firm', ears: 'rose', snout: 0.8, coats: ['#6b4a33', '#3b3b3b', '#8c6a4f', '#2f3a4a'], mask: '#f2ede6', maskStyle: 'blaze', bias: ['muscle', 'wheels', 'charm'] },
  poodle: { label: 'Poodle', faction: 'poodle', ears: 'puff', snout: 1.0, coats: ['#f4f1ea', '#e8b77c', '#2b2b2b', '#c9c3bb'], bias: ['charm', 'disguise', 'agility'] },
  corgi: { label: 'Corgi', faction: 'poodle', ears: 'bat', snout: 0.95, coats: ['#e08a3c', '#c9772f'], mask: '#fbf3e6', maskStyle: 'blaze', bias: ['charm', 'sneak'] },
  pug: { label: 'Pug', faction: 'poodle', ears: 'rose', snout: 0.35, coats: ['#e3c79a', '#2a2724'], mask: '#2a2320', maskStyle: 'muzzle', bias: ['charm', 'disguise'] },
  greyhound: { label: 'Greyhound', faction: 'whippet', ears: 'fold', snout: 1.5, narrow: true, coats: ['#8d8f96', '#c7b299', '#3c3c42'], bias: ['wheels', 'agility'] },
  whippet: { label: 'Whippet', faction: 'whippet', ears: 'fold', snout: 1.35, narrow: true, coats: ['#d6c3a8', '#9aa0a8', '#f1ece4'], bias: ['wheels', 'sneak', 'agility'] },
  jackrussell: { label: 'Jack Russell', faction: 'terrier', ears: 'fold', snout: 0.95, coats: ['#f5f1ea'], patch: '#9a5b2c', bias: ['agility', 'locks', 'nose'] },
  bordert: { label: 'Border Terrier', faction: 'terrier', ears: 'fold', snout: 0.8, coats: ['#a0785a', '#8a6a52'], mask: '#3a2c22', maskStyle: 'muzzle', bias: ['locks', 'sneak', 'muscle'] },
  beagle: { label: 'Beagle', faction: 'hounds', ears: 'floppy', snout: 1.0, coats: ['#c98b45'], mask: '#fbf6ee', maskStyle: 'blaze', patch: '#2e2620', bias: ['nose', 'sneak'] },
  basset: { label: 'Basset Hound', faction: 'hounds', ears: 'long', snout: 1.05, jowls: true, coats: ['#b3763c', '#f1e7d7'], mask: '#fbf6ee', maskStyle: 'blaze', bias: ['nose', 'charm'] },
  bloodhound: { label: 'Bloodhound', faction: 'hounds', ears: 'long', snout: 1.2, jowls: true, coats: ['#9b5a2e', '#7a4424'], bias: ['nose', 'muscle'] },
  dachshund: { label: 'Dachshund', faction: 'indie', ears: 'floppy', snout: 1.3, coats: ['#8a4b22', '#2a1f1b'], mask: '#b87a44', maskStyle: 'points', bias: ['sneak', 'agility', 'nose'] },
  dalmatian: { label: 'Dalmatian', faction: 'indie', ears: 'floppy', snout: 1.05, coats: ['#fbfbf8'], spots: '#1d1d1f', bias: ['disguise', 'wheels', 'aim'] },
  labrador: { label: 'Labrador', faction: 'indie', ears: 'floppy', snout: 1.0, coats: ['#e8c07a', '#262120', '#6a3f22'], bias: ['charm', 'muscle', 'nose'] },
  chihuahua: { label: 'Chihuahua', faction: 'indie', ears: 'bat', snout: 0.6, coats: ['#e2b37e', '#2a2420', '#f2e7d8'], small: true, bias: ['sneak', 'tech', 'agility'] },
  collie: { label: 'Border Collie', faction: 'indie', ears: 'fold', snout: 1.1, coats: ['#1f1d1c'], mask: '#fbf8f2', maskStyle: 'blaze', bias: ['tech', 'nose', 'agility'] },
  italiangreyhound: { label: 'Italian Greyhound', faction: 'family', ears: 'fold', snout: 1.45, narrow: true, coats: ['#9aa0ab', '#c9b7a0', '#5b5f6b', '#e6ddd0'], bias: ['wheels', 'charm', 'agility'] },
  shiba: { label: 'Shiba Inu', faction: 'syndicate', ears: 'pointy', snout: 0.9, coats: ['#d9853b', '#c97a3a', '#2b2522', '#e9d7b8'], mask: '#fbf3e6', maskStyle: 'muzzle', bias: ['sneak', 'aim', 'tech'] },
  spaniel: { label: 'Spaniel', faction: 'indie', ears: 'long', snout: 1.0, coats: ['#a8552a', '#f3ebe0'], patch: '#6a2f16', bias: ['aim', 'nose', 'charm'] },
};

export const FACTIONS = {
  ze: { label: 'Ze Germans', voice: 'ze', blurb: 'Precise. Punctual. Terrifying.' },
  firm: { label: 'The Bulldog Firm', voice: 'cockney', blurb: 'Hard lads from Bonechapel.' },
  poodle: { label: 'The Poodle Set', voice: 'posh', blurb: 'Old money. Older grudges.' },
  whippet: { label: 'The Whippet Wheelmen', voice: 'cockney', blurb: 'Fastest drivers in Dogsbury.' },
  terrier: { label: 'The Terrier Lads', voice: 'cockney', blurb: 'Small, scrappy, never let go.' },
  hounds: { label: 'The Hounds of Bonechapel', voice: 'neutral', blurb: 'Noses for hire. Mouths shut.' },
  family: { label: 'The Greyhound Family', voice: 'family', blurb: 'Sharp suits, long memories. They call it respect.' },
  syndicate: { label: 'The Shiba Syndicate', voice: 'syndicate', blurb: 'Quiet, tidy, and they never forget a debt.' },
  indie: { label: 'Freelancer', voice: 'neutral', blurb: 'Answers to nobody.' },
};

export const VOICES = {
  cockney: {
    hire: ['Alright guv\'nor, I\'m in.', 'Say no more. Nudge nudge.', 'Proper job. Count me in.', 'Lovely jubbly.'],
    ok: ['Sorted.', 'Easy peasy.', 'Told ya. Nuffin\' to it.', 'Have it!', 'Lovely jubbly.', 'Like takin\' a bone off a puppy.'],
    fail: ['Cor blimey!', 'Leave it aht!', 'That\'s torn it!', 'Oh, bloomin\' \'eck.', 'It\'s all gone pear-shaped!'],
    caught: ['I ain\'t sayin\' nuffin\'!', 'You got nuffin\' on me, copper.'],
    talk: ['Alright, alright! I\'ll tell ya everyfink!'],
  },
  posh: {
    hire: ['Splendid. Do count me in, old bean.', 'One does enjoy a little caper.', 'Charmed, I\'m sure.'],
    ok: ['Frightfully straightforward.', 'Spiffing.', 'Tally-ho!', 'Child\'s play, darling.'],
    fail: ['I say, how dreadfully awkward.', 'Oh, bother.', 'Good heavens!', 'This is most irregular.'],
    caught: ['I shall want my solicitor. And a biscuit.', 'Do you know who my father is?'],
    talk: ['Very well, I shall sing like a canary. Is there tea?'],
  },
  ze: {
    hire: ['Ja. Ze fee is acceptable.', 'Ve are in.', 'Ze plan. Show me ze plan.'],
    ok: ['Ze plan is vorking.', 'Precisely as calculated.', 'Ja. Sorted.', 'Efficient.'],
    fail: ['Zis vas not in ze plan!', 'Nein, nein, NEIN!', 'Unacceptable!'],
    caught: ['I vill say nozzing.', 'Ze name is... nobody.'],
    talk: ['Fine! Ze plan vas as follows...'],
  },
  neutral: {
    hire: ['I\'m in. Don\'t make me regret it.', 'Right. Let\'s get to work.', 'Fair money. I\'ll do it.'],
    ok: ['Done.', 'Clean.', 'Like a walk in the park.', 'Nothing to it.'],
    fail: ['That wasn\'t supposed to happen.', 'Oh no. Oh no no no.', 'Bad dog— bad luck. Bad luck.'],
    caught: ['I want my lawyer.', 'No comment.'],
    talk: ['Okay! Okay. I\'ll tell you what I know.'],
  },
  family: {
    hire: ['The Family says you\'re good for it. I\'m in.', 'Sure. Consider it a favour.', 'Business is business.'],
    ok: ['Just business.', 'Clean. The Don likes clean.', 'Consider it handled.', 'Like I was never there.'],
    fail: ['This is a disrespect!', 'Somebody\'s gonna answer for this.', 'This was not the arrangement!'],
    caught: ['I got nothing to say. I got a good memory, though.', 'Call my lawyer. He\'s family.'],
    talk: ['Okay, okay! But you never heard it from me.'],
  },
  syndicate: {
    hire: ['A fair price. I accept.', 'Your work is tidy. We value tidy.', 'Agreed.'],
    ok: ['Precisely.', 'As planned.', 'Tidy.', 'Silence is the best signature.'],
    fail: ['Unacceptable.', 'This will be remembered.', 'A mistake. Mine.'],
    caught: ['...', 'I have nothing to say to you, Inspector.'],
    talk: ['I have shamed myself. Very well.'],
  },
  mumble: {
    hire: ['Mrrmph. Hrrf wuf.', 'Nnnrrgh. Aye-hrrf.'],
    ok: ['Hnnrf! Mrrm\'d it.', 'Hrrf-hrrf.'],
    fail: ['Grrrmph brrf!', 'Wrrrmmph!'],
    caught: ['Mmmrrh hrrf nnghh.'],
    talk: ['Hrrrmmph mrrf wuf-wuf hrrm, ye-hrrf.'],
  },
};

export const NAMES = {
  cockney: ['Barry', 'Terry', 'Reggie', 'Ronnie', 'Del', 'Kev', 'Sid', 'Dot', 'Sharon', 'Tracy', 'Arfur', 'Lenny', 'Vinnie', 'Tommy', 'Stan', 'Mabel', 'Ernie', 'Queenie', 'Dougie', 'Frankie', 'Winnie', 'Nobby', 'Chalky', 'Gordon'],
  posh: ['Percival', 'Cedric', 'Rupert', 'Monty', 'Tarquin', 'Jemima', 'Arabella', 'Pandora', 'Hugo', 'Basil', 'Beatrice', 'Ptolemy', 'Clementine', 'Algernon', 'Felicity', 'Rollo'],
  ze: ['Klaus', 'Dieter', 'Gunther', 'Heidi', 'Ingrid', 'Fritz', 'Hans', 'Wolfgang', 'Lotte', 'Jurgen', 'Greta', 'Otto'],
  family: ['Vincent', 'Frankie', 'Tony', 'Lou', 'Nicky', 'Gina', 'Rosa', 'Sonny', 'Benny', 'Carla', 'Paulie', 'Connie'],
  syndicate: ['Maple', 'Ginger', 'Sesame', 'Pepper', 'Chestnut', 'Toffee', 'Cinder', 'Ember', 'Russet', 'Hazel', 'Kit', 'Ash'],
  neutral: ['Max', 'Bruno', 'Rex', 'Lulu', 'Pearl', 'Ruby', 'Butch', 'Spike', 'Bernard', 'Winston', 'Gladys', 'Mo', 'Pixie', 'Duke', 'Sadie', 'Rocco', 'Bonnie', 'Jack', 'Nell', 'Otis'],
};
export const SURNAMES = {
  cockney: ['Barkley', 'Pawson', 'Kibbleton', 'Growler', 'Fetcham', 'Muttson', 'Collarbone', 'Biscuitt', 'Chewson', 'Scratchley', 'Leadbetter', 'Howlett', 'Snoutley', 'Gravy'],
  posh: ['Woofington', 'Fluffington-Smythe', 'Poodleston', 'Pawsworth-Grey', 'de Barkley', 'Snootington', 'Waggstaff', 'Furrington', 'Houndsworth'],
  ze: ['von Sniffen', 'Schnauzmann', 'Droolberg', 'Barkhausen', 'Wuffmeister', 'Knochenbauer', 'Pfotenhauer'],
  family: ['Longshanks', 'Sleekcoat', 'Velvetpaw', 'Slimleg', 'Silverstreak', 'Narrowmore', 'Finewhisker'],
  syndicate: ['Curltail', 'Foxface', 'Stillwater', 'Quietstep', 'Redcoat', 'Nightpaw', 'Sharpear'],
  neutral: ['Bonewright', 'Snufflebottom', 'Barkworth', 'Tailor', 'Houndsworth', 'Muttley-Jones', 'Pawley', 'Wagner-Smith', 'Chewbury', 'Fetch'],
};
export const NICKNAMES = [
  'The Bone', 'Two-Tone', 'Knuckles', 'Snout', 'The Nose', 'Four-Paws', 'Wet Nose', 'Scruffy', 'Sniffer', 'Slippers',
  'The Brick', 'Lead-Foot', 'Muzzle', 'Shadow', 'The Tail', 'Chewie', 'Biscuits', 'Gravy', 'Chops', 'Soapy', 'Tumbler',
  'Sparks', 'Wheels', 'Specs', 'Lucky', 'The Professor', 'Bullet-Tooth', 'The Bite', 'Squeaky', 'The Duke', 'Posh',
  'Brick-Top', 'Bacon', 'Big Chris', 'Hatchet', 'The Whisper', 'Fluffy', 'Tripod', 'Sausage', 'Pudding', 'Dog-Ear',
  'The Collar', 'Fetch', 'Scraps', 'Crumbs', 'The Butler', 'Rover', 'Kipper', 'Flea', 'Dribbles',
];

// Parody catchphrases, keyed loosely to archetypes.
export const ARCHETYPES = [
  { id: 'pro', label: 'The Professional', line: 'Never get attached to a chew toy you can\'t drop in thirty seconds flat.' },
  { id: 'pink', label: 'The Stickler', line: 'I don\'t do belly rubs. On principle.' },
  { id: 'blonde', label: 'The Psycho', line: 'Are you gonna bark all day, or are you gonna bite?' },
  { id: 'doors', label: 'The Demolition Man', line: 'You were only supposed to chew the bloody doors off!' },
  { id: 'heavy', label: 'The Heavy', line: 'Heavy is good. Heavy is reliable. Like a proper marrowbone.' },
  { id: 'emotional', label: 'The Enforcer', line: 'It\'s been emotional.' },
  { id: 'rookie', label: 'The Rookie', line: 'Is this... is this a real heist? Like, a proper one?' },
  { id: 'fixer', label: 'The Fixer', line: 'I know a bloke. I always know a bloke.' },
  { id: 'magician', label: 'The Magician', line: 'Now you see me. Now you see a slightly different poodle.' },
  { id: 'veteran', label: 'The Old Pro', line: 'You can\'t teach an old pro new tricks. You don\'t need to.' },
  { id: 'wheelman', label: 'The Wheelman', line: 'Five minutes. After that I\'m gone, with or without you.' },
  { id: 'smooth', label: 'The Smooth Talker', line: 'Relax. I\'ve got a face people trust. It\'s the eyes.' },
  { id: 'nose', label: 'The Sniffer', line: 'I\'ve got a nose for trouble. And for sausages.' },
  { id: 'nervous', label: 'The Worrier', line: 'Nobody said anything about guards. Why are there always guards?' },
  { id: 'boss', label: 'The Hard Case', line: 'Don\'t bark before you\'re bitten, sunshine.' },
  { id: 'ghost', label: 'The Ghost', line: 'Knock knock. Who\'s there? Nobody. I was never here.' },
  { id: 'gambler', label: 'The Gambler', line: 'Pear-shaped is just a shape. I like pears.' },
  { id: 'gent', label: 'The Gentleman Thief', line: 'Diamonds are forever. Bones are for now.' },
  { id: 'lazy', label: 'The Sleeper', line: 'Wake me when the vault\'s open.' },
  { id: 'loyal', label: 'The Loyal One', line: 'You look after me, I look after you. Simple as.' },
  { id: 'walker', label: 'The Planner', line: 'In and out. Quick as a walk round the block.' },
  { id: 'sleeping', label: 'The Pacifist', line: 'Let sleeping guards lie.' },
  { id: 'paws', label: 'The Accountant', line: 'Paws off my share, and nobody gets hurt.' },
  { id: 'bone', label: 'The Philosopher', line: 'I\'ve got a bone to pick with the world. Several, actually.' },
];

// Kit: bonus = +difficulty relief when the approach lists it; consumable kit is
// used up when the step runs.
export const KIT = {
  lockpicks: { name: 'Lockpicks', price: 80, icon: '🗝️', consumable: false, blurb: '+2 on lock work.' },
  stethoscope: { name: 'Stethoscope', price: 120, icon: '🩺', consumable: false, blurb: '+2 cracking safes by ear.' },
  laptop: { name: 'Hacker Laptop', price: 250, icon: '💻', consumable: false, blurb: '+2 on cameras and keypads.' },
  grapple: { name: 'Grappling Rope', price: 100, icon: '🪝', consumable: false, blurb: 'Needed for skylights and roof escapes.' },
  uniforms: { name: 'Staff Uniforms', price: 150, icon: '👔', consumable: true, blurb: 'Needed to pose as staff. Used up.' },
  slingshot: { name: 'Slingshot', price: 60, icon: '🎯', consumable: false, blurb: '+2 popping camera lenses.' },
  squeaky: { name: 'Squeaky Toy', price: 20, icon: '🧸', consumable: true, blurb: 'Guards can\'t resist. Used up.' },
  laserpointer: { name: 'Laser Pointer', price: 40, icon: '🔴', consumable: false, blurb: 'For security cats. Trust us.' },
  tuna: { name: 'Tin of Tuna', price: 15, icon: '🥫', consumable: true, blurb: 'Cat bribe. Used up.' },
  drill: { name: 'Thermic Drill', price: 300, icon: '🛠️', consumable: false, blurb: 'Through vaults and walls. Very loud.' },
  van: { name: 'Getaway Van', price: 500, icon: '🚐', consumable: false, blurb: 'Ram raids, +3 carry, +2 getaway. Burned if the alarm goes.' },
  moped: { name: 'Mopeds', price: 200, icon: '🛵', consumable: false, blurb: 'Nippy alley getaway.' },
  bags: { name: 'Big Swag Bags', price: 30, icon: '💰', consumable: true, blurb: '+2 carry. Used up.' },
  smoke: { name: 'Smoke Bombs', price: 90, icon: '💨', consumable: true, blurb: 'Better odds of escaping capture. Used up.' },
};

// Approaches. mod = difficulty relative to the job's base; noise = alarm on
// success; failNoise = alarm on failure; clues = evidence left on success.
// needKit/needIntel/needInsider/needBribe gate the option; kitBonus/intelBonus
// make it easier.
export const APPROACHES = {
  // ---- Entry
  e_pick: { label: 'Pick the tradesman\'s door', skill: 'locks', mod: 0, noise: 0, failNoise: 2, clues: 0, kitBonus: 'lockpicks', ok: '{d} works the pins. Click. In.', fail: '{d} snaps a pick in the lock. The door rattles.' },
  e_charm: { label: 'Sweet-talk the doorman', skill: 'charm', mod: 0, noise: 0, failNoise: 2, clues: 1, ok: '{d} chats up the doorman about the weather. Waved straight through.', fail: 'The doorman isn\'t buying it. He reaches for his whistle.' },
  e_staff: { label: 'Stroll in as staff', skill: 'disguise', mod: -1, noise: 0, failNoise: 2, clues: 0, needKit: 'uniforms', ok: '{d} strolls in wearing a uniform and a clipboard. Nobody blinks.', fail: 'The uniform is two sizes too small. Someone points.' },
  e_skylight: { label: 'Over the roofs, in the skylight', skill: 'agility', mod: 0, noise: 0, failNoise: 3, clues: 0, needKit: 'grapple', ok: '{d} drops through the skylight like a feather.', fail: '{d} drops through the skylight like a sack of spuds.' },
  e_sewer: { label: 'Up through the sewers', skill: 'sneak', mod: -1, noise: 0, failNoise: 1, clues: 0, needIntel: 'blueprints', ok: '{d} pops up through a floor grate. Smells awful. Totally unseen.', fail: 'Wrong tunnel. {d} surfaces in the middle of the lobby.' },
  e_vent: { label: 'Crawl in through the air vents', skill: 'agility', mod: 1, noise: 0, failNoise: 2, clues: 0, needIntel: 'blueprints', ok: '{d} wriggles through the vents and out a grille.', fail: '{d} gets stuck in a vent. The banging echoes.' },
  e_delivery: { label: 'Pose as a sausage delivery', skill: 'disguise', mod: 0, noise: 0, failNoise: 2, clues: 1, ok: '"Sausages for Mr... Sausage?" It works. Somehow.', fail: 'Nobody ordered sausages. Suspicion is high.' },
  e_ram: { label: 'Ram-raid the front window', skill: 'wheels', mod: -2, noise: 5, failNoise: 6, clues: 2, needKit: 'van', ok: '{d} puts the van through the front window. Subtle as a brick.', fail: '{d} misses the window and hits a lamppost. Very loud.' },
  e_insider: { label: 'Inside dog props the door', skill: 'sneak', mod: -3, noise: 0, failNoise: 1, clues: 0, needInsider: true, ok: 'The inside dog props the fire door with a chew toy. Walk right in.', fail: 'The inside dog gets called to the manager\'s office at the worst moment.' },
  // ---- Obstacles
  o_sneakpast: { label: 'Sneak past on the patrol gap', skill: 'sneak', mod: 0, noise: 0, failNoise: 3, clues: 0, intelBonus: 'guard_rota', ok: '{d} slips by in the gap between patrols.', fail: 'A guard turns round. Torchlight, right in the face.' },
  o_squeaky: { label: 'Lob a squeaky toy down the corridor', skill: 'aim', mod: -2, noise: 0, failNoise: 2, clues: 1, needKit: 'squeaky', ok: 'SQUEAK. Every guard in the building chases it. Can\'t help themselves.', fail: 'The toy bounces off a guard\'s head. He is not amused.' },
  o_knockout: { label: 'Have a quiet word (loudly)', skill: 'muscle', mod: 0, noise: 2, failNoise: 3, clues: 1, ok: '{d} has a word. The guards have a lie down.', fail: 'The guards have a word back. A loud one.' },
  o_relief: { label: 'Pose as the relief shift', skill: 'disguise', mod: -1, noise: 0, failNoise: 2, clues: 0, needKit: 'uniforms', ok: '"Shift change, lads. Off you pop." And off they pop.', fail: '"We don\'t have a shift change at two a.m." Oops.' },
  o_bribed: { label: 'Wave at the guard you bribed', skill: 'charm', mod: -4, noise: 0, failNoise: 2, clues: 0, needBribe: true, ok: 'The bribed guard is looking very hard at a crossword.', fail: 'The bribed guard has had second thoughts.' },
  o_loop: { label: 'Loop the camera feed', skill: 'tech', mod: 0, noise: 0, failNoise: 2, clues: 0, kitBonus: 'laptop', ok: 'The monitors show an empty corridor. On repeat.', fail: 'The feed glitches. The control room goes, "Hang on..."' },
  o_shoot: { label: 'Pop the lenses with a slingshot', skill: 'aim', mod: -1, noise: 1, failNoise: 2, clues: 1, kitBonus: 'slingshot', ok: 'Ping. Ping. Ping. Every camera, blind.', fail: 'Ping. Miss. Ping. Miss. The camera swivels round.' },
  o_blindspot: { label: 'Creep through the blind spots', skill: 'sneak', mod: 1, noise: 0, failNoise: 2, clues: 0, intelBonus: 'camera_map', ok: '{d} weaves between the cameras like a shadow.', fail: '{d} steps right into shot. Waves, awkwardly.' },
  o_hats: { label: 'Hats down low and just walk', skill: 'disguise', mod: 1, noise: 0, failNoise: 1, clues: 1, ok: 'Flat caps down, collars up. On camera, but unrecognisable.', fail: 'Great footage of {d}. Crystal clear.' },
  o_limbo: { label: 'Limbo under the lasers', skill: 'agility', mod: 0, noise: 0, failNoise: 3, clues: 0, ok: '{d} limbos under the grid. Tail tucked. Flawless.', fail: 'A tail breaks the beam. Of course it\'s the tail.' },
  o_short: { label: 'Short the laser circuit', skill: 'tech', mod: 1, noise: 0, failNoise: 2, clues: 0, intelBonus: 'blueprints', kitBonus: 'laptop', ok: 'Fizz. The lasers wink out.', fail: 'Fizz. Every light in the building comes on instead.' },
  o_mirror: { label: 'Bounce the beams with a mirror', skill: 'aim', mod: 1, noise: 0, failNoise: 2, clues: 0, ok: 'A compact mirror redirects the beam. Very dashing.', fail: 'The beam bounces straight into a sensor.' },
  o_laser: { label: 'Laser-pointer the cat into a cupboard', skill: 'aim', mod: -3, noise: 0, failNoise: 2, clues: 0, needKit: 'laserpointer', ok: 'The red dot leads the cat into a cupboard. Click.', fail: 'The cat looks at the dot. Then at {d}. Then it screams.' },
  o_tuna: { label: 'Bribe it with a tin of tuna', skill: 'charm', mod: -2, noise: 0, failNoise: 2, clues: 1, needKit: 'tuna', ok: 'The cat accepts the tuna. A deal is a deal.', fail: 'The cat takes the tuna AND raises the alarm. Typical.' },
  o_tiptoe: { label: 'Tiptoe past. Very, very slowly', skill: 'sneak', mod: 2, noise: 0, failNoise: 3, clues: 0, ok: 'The cat opens one eye. Closes it. Phew.', fail: 'HISSSSSS. The cat is on the alarm button.' },
  o_stare: { label: 'Stare it down', skill: 'muscle', mod: 1, noise: 1, failNoise: 3, clues: 0, ok: '{d} stares. The cat blinks first. Unheard of.', fail: 'The cat wins the staring contest. They always do.' },
  o_hop: { label: 'Hopscotch the safe tiles', skill: 'agility', mod: 0, noise: 0, failNoise: 3, clues: 0, intelBonus: 'plate_map', ok: 'Hop, skip, hop. Not a single click.', fail: 'Click.' },
  o_sniffplates: { label: 'Sniff out the live plates', skill: 'nose', mod: 0, noise: 0, failNoise: 3, clues: 0, ok: '{d} sniffs each tile. The live ones smell of wires.', fail: 'That one smelled fine. It was not fine.' },
  o_sandbag: { label: 'Jam them with sandbags', skill: 'muscle', mod: 1, noise: 1, failNoise: 2, clues: 1, ok: 'Sandbags down. The plates think everything\'s normal.', fail: 'A sandbag splits. Sand everywhere. Plates everywhere.' },
  // ---- Vault
  v_crack: { label: 'Crack the safe by ear', skill: 'locks', mod: 1, noise: 0, failNoise: 2, clues: 0, kitBonus: 'stethoscope', ok: '{d} listens. Click... click... click. It swings open.', fail: 'Too many clicks. The safe\'s anti-tamper bolts slam in.' },
  v_drill: { label: 'Drill the hinges', skill: 'muscle', mod: -1, noise: 3, failNoise: 4, clues: 1, needKit: 'drill', ok: 'Sparks fly. The door falls off with a clang.', fail: 'The drill bit snaps. The whine could wake the dead.' },
  v_keypad: { label: 'Hack the keypad', skill: 'tech', mod: 1, noise: 0, failNoise: 2, clues: 0, kitBonus: 'laptop', ok: 'Beep boop beep. Access granted.', fail: 'ACCESS DENIED. ACCESS DENIED. ACCESS DENIED.' },
  v_combo: { label: 'Punch in the combination', skill: 'locks', mod: -4, noise: 0, failNoise: 1, clues: 0, needIntel: 'combo', ok: 'The numbers from the intel. First try.', fail: 'Someone copied the numbers down wrong.' },
  v_swap: { label: 'Swap the goods for fakes', skill: 'sneak', mod: 1, noise: 0, failNoise: 2, clues: -1, swap: true, ok: '{d} swaps the real goods for convincing fakes. They\'ll never know.', fail: '{d} knocks the fakes over. Crash.' },
  v_smash: { label: 'Smash and grab', skill: 'muscle', mod: -2, noise: 4, failNoise: 4, clues: 2, ok: 'SMASH. Grab. Done.', fail: 'The glass doesn\'t smash. {d} bounces off it.' },
  v_pickcase: { label: 'Pick the case locks', skill: 'locks', mod: 0, noise: 0, failNoise: 2, clues: 0, kitBonus: 'lockpicks', ok: 'Tiny locks, tiny picks. Open.', fail: 'The case has a tilt sensor. It tilts.' },
  v_timelock: { label: 'Fool the time lock', skill: 'tech', mod: 1, noise: 0, failNoise: 2, clues: 0, kitBonus: 'laptop', ok: 'The vault thinks it\'s nine a.m. It opens, bless it.', fail: 'The vault thinks it\'s under attack. Which it is.' },
  v_manager: { label: 'Talk the manager into opening it', skill: 'charm', mod: 2, noise: 0, failNoise: 3, clues: 2, ok: '{d} rings the manager at home. "Emergency inspection, sir." He opens it himself.', fail: 'The manager calls the police. Then his mum.' },
  // ---- Exit
  x_same: { label: 'Back out the way we came', skill: 'sneak', mod: -1, noise: 0, failNoise: 2, clues: 0, ok: 'Out the way they came. Neat.', fail: 'The way they came is now full of guards.' },
  x_chute: { label: 'Down the laundry chute', skill: 'agility', mod: 0, noise: 0, failNoise: 2, clues: 1, ok: 'Wheee! Straight into a laundry cart.', fail: 'Wheee— stuck. Halfway down. With the swag.' },
  x_front: { label: 'Out the front, bold as brass', skill: 'disguise', mod: 1, noise: 0, failNoise: 2, clues: 1, ok: 'Right out the front door, tipping their hats to the night guard.', fail: 'The night guard recognises them from the telly.' },
  x_wall: { label: 'Through the wall', skill: 'muscle', mod: 0, noise: 3, failNoise: 4, clues: 2, needKit: 'drill', ok: 'Through the wall and into the alley. Brick dust everywhere.', fail: 'The wall is load-bearing. Half the ceiling comes with them.' },
  x_roof: { label: 'Up to the roof and zip-line off', skill: 'agility', mod: 0, noise: 0, failNoise: 2, clues: 0, needKit: 'grapple', ok: 'Zzzzzip. Across the rooftops and gone.', fail: 'Zzzzip— SNAP. Someone forgot to tie the knot.' },
  // ---- Getaway
  g_hotwire: { label: 'Hot-wire a motor on the street', skill: 'tech', mod: 1, noise: 1, failNoise: 2, clues: 1, ok: 'Two wires, one spark, and they\'re away.', fail: 'The car alarm goes off. The whole street wakes up.' },
  g_van: { label: 'Pile into the getaway van', skill: 'wheels', mod: -1, noise: 0, failNoise: 2, clues: 0, needKit: 'van', kitBonus: 'van', ok: '{d} floors it. Handbrake turn. Gone.', fail: '{d} stalls the van. Twice.' },
  g_moped: { label: 'Mopeds through the alleys', skill: 'wheels', mod: 0, noise: 0, failNoise: 2, clues: 0, needKit: 'moped', ok: 'A swarm of mopeds vanishes into the back alleys.', fail: 'A moped runs out of petrol. Right outside a police box.' },
  g_crowd: { label: 'Melt into the crowd', skill: 'disguise', mod: 1, noise: 0, failNoise: 2, clues: 0, crowd: true, ok: 'Just another bunch of blokes in flat caps.', fail: 'There is no crowd. There is them, and a policeman.' },
  g_barge: { label: 'Slow canal barge', skill: 'wheels', mod: -1, noise: 0, failNoise: 1, clues: -1, slow: true, ok: 'Chug... chug... chug. Nobody suspects a barge.', fail: 'The barge is overtaken by a jogger. Then a police boat.' },
  g_walk: { label: 'Walk. Casual. Whistle', skill: 'sneak', mod: 1, noise: 0, failNoise: 2, clues: 0, ok: 'Whistling a jaunty tune, they walk off into the night.', fail: 'The whistling is suspicious. Very suspicious.' },
};

export const OBSTACLES = {
  guards: { label: 'The Guards', icon: '👮', options: ['o_sneakpast', 'o_squeaky', 'o_knockout', 'o_relief', 'o_bribed'] },
  cameras: { label: 'The Cameras', icon: '📹', options: ['o_loop', 'o_shoot', 'o_blindspot', 'o_hats'] },
  lasers: { label: 'Laser Grid', icon: '🟥', options: ['o_limbo', 'o_short', 'o_mirror'] },
  cat: { label: 'Mr. Whiskers, Security Cat', icon: '🐈', options: ['o_laser', 'o_tuna', 'o_tiptoe', 'o_stare'], hazard: true },
  plates: { label: 'Pressure Plates', icon: '⬛', options: ['o_hop', 'o_sniffplates', 'o_sandbag'], hazard: true },
};

export const VAULTS = {
  safe: { label: 'The Safe', icon: '🗄️', options: ['v_crack', 'v_drill', 'v_keypad', 'v_combo'] },
  case: { label: 'The Display Case', icon: '💎', options: ['v_swap', 'v_smash', 'v_pickcase'] },
  strongroom: { label: 'The Strongroom', icon: '🏦', options: ['v_timelock', 'v_drill', 'v_manager', 'v_combo'] },
};

export const ENTRY_POOL = ['e_pick', 'e_charm', 'e_staff', 'e_skylight', 'e_sewer', 'e_vent', 'e_delivery', 'e_ram', 'e_insider'];
export const EXIT_POOL = ['x_same', 'x_chute', 'x_front', 'x_wall', 'x_roof'];
export const GETAWAY_POOL = ['g_hotwire', 'g_van', 'g_moped', 'g_crowd', 'g_barge', 'g_walk'];

// Loot kinds: cash fences easily; art is hard to shift; oddities are dog-themed
// collector pieces. bulk = carry slots.
export const LOOT_KINDS = {
  cash: { label: 'Cash', icon: '💷' },
  jewel: { label: 'Jewellery', icon: '💎' },
  art: { label: 'Art', icon: '🖼️' },
  oddity: { label: 'Collectable', icon: '🦴' },
};

export const VENUES = {
  bank: {
    names: ['The First Bank of Bonechapel', 'Kibble & Sons Private Bank', 'The Old Collar Savings Bank'],
    vaults: ['strongroom', 'safe'], obstacles: ['guards', 'cameras', 'lasers'],
    loot: [['Stacks of used fivers', 'cash', 1, 3], ['Gold bars', 'jewel', 3, 5], ['A mystery deposit box', 'oddity', 1, 4], ['The Golden Bone', 'oddity', 1, 8], ['Bearer bonds', 'cash', 1, 4]],
  },
  museum: {
    names: ['The Pawtural History Museum', 'The Dogsbury Gallery', 'The Kennelworth Collection'],
    vaults: ['case'], obstacles: ['guards', 'cameras', 'lasers'],
    loot: [['"Portrait of a Lady with a Tennis Ball"', 'art', 2, 6], ['"The Scream (at the Postman)"', 'art', 2, 7], ['The Pharaoh\'s Squeaky Toy', 'oddity', 1, 6], ['A jewelled ceremonial collar', 'jewel', 1, 5], ['A fossilised mega-bone', 'oddity', 4, 7]],
  },
  jeweller: {
    names: ['Bling & Barkley Jewellers', 'Glitterpaws of Pawcaster Square', 'Sparkle & Sniff'],
    vaults: ['case', 'safe'], obstacles: ['guards', 'cameras'],
    loot: [['A tray of diamond rings', 'jewel', 1, 4], ['The Duchess\'s Diamond Collar', 'jewel', 1, 7], ['Pearls, several strings', 'jewel', 1, 3], ['The 86-carat "Bonehenge" diamond', 'jewel', 1, 9], ['A gold-plated food bowl', 'oddity', 2, 3]],
  },
  mansion: {
    names: ['Lord Woofington\'s Townhouse', 'Fluffington Hall', 'The Snootington Residence'],
    vaults: ['safe', 'case'], obstacles: ['guards', 'cameras'],
    loot: [['The family silver', 'jewel', 3, 3], ['An oil painting of his Lordship (in a ruff)', 'art', 2, 4], ['A vintage chew-toy collection', 'oddity', 2, 5], ['Bundles of cash under the mattress', 'cash', 1, 3], ['Her Ladyship\'s tiara', 'jewel', 1, 6]],
  },
  casino: {
    names: ['The Lucky Paw Casino', 'The Golden Kennel Club', 'Snake Eyes & Sausages'],
    vaults: ['strongroom'], obstacles: ['guards', 'cameras', 'lasers'],
    loot: [['The night\'s takings', 'cash', 2, 6], ['High-roller chips', 'cash', 1, 4], ['A solid gold roulette ball', 'oddity', 1, 5], ['The owner\'s lucky diamond cufflinks', 'jewel', 1, 4]],
  },
  butcher: {
    names: ['Brick Bone\'s Butcher Vault', 'The Sausage King\'s Cold Store', 'Mutton & Sons Premium Meats'],
    vaults: ['strongroom', 'safe'], obstacles: ['guards', 'cameras'],
    loot: [['Prize-winning sausages', 'oddity', 2, 4], ['A crate of dry-aged steaks', 'oddity', 3, 4], ['Brick Bone\'s cash box', 'cash', 1, 5], ['A diamond-studded meat cleaver', 'jewel', 1, 5]],
  },
  show: {
    names: ['The Grand Pedigree Show', 'The Best in Show Gala', 'The Kennelworth Obedience Trials'],
    vaults: ['case', 'safe'], obstacles: ['guards', 'cameras'],
    loot: [['The Best in Show trophy', 'oddity', 2, 6], ['The prize money', 'cash', 1, 5], ['A rosette made of rubies', 'jewel', 1, 5], ['The judges\' secret biscuit stash', 'oddity', 1, 2]],
  },
  auction: {
    names: ['Snobbes & Co. Auction Rooms', 'Gavel & Growl Auctioneers', 'The Pawcaster Salerooms'],
    vaults: ['strongroom', 'case'], obstacles: ['guards', 'cameras', 'lasers'],
    loot: [['"Water Lilies with Stick"', 'art', 2, 8], ['A Ming-style water bowl', 'oddity', 2, 6], ['A signed first-edition ball', 'oddity', 1, 4], ['A sapphire the size of a biscuit', 'jewel', 1, 7]],
  },
};
export const VENUE_LABELS = { bank: 'Bank', museum: 'Museum', jeweller: 'Jewellers', mansion: 'Mansion', casino: 'Casino', butcher: 'Butcher\'s', show: 'Pedigree Show', auction: 'Auction House' };

export const DISTRICTS = ['Bonechapel', 'Kennelworth', 'Pawcaster Square', 'Fetchley Market', 'Old Kibble Street', 'Muttingham Green', 'Collarbone Wharf', 'Snufflebury'];

export const JOB_CODEWORDS = ['Walkies', 'Fetch', 'Belly Rub', 'Good Boy', 'Roll Over', 'Dinnertime', 'Sit Stay', 'Tennis Ball', 'Postman', 'Bath Night', 'Squirrel', 'Muddy Paws'];

// Intel that can be gathered by casing the joint.
export const INTEL = {
  guard_rota: { label: 'Guard rota', blurb: 'When the patrols change. Sneaking past guards is much easier.' },
  camera_map: { label: 'Camera layout', blurb: 'Where the blind spots are.' },
  blueprints: { label: 'Blueprints', blurb: 'Unlocks sewer and vent entries; easier to short circuits.' },
  combo: { label: 'Vault combination', blurb: 'Scribbled on a sticky note by the manager. Unlocks the combination option.' },
  plate_map: { label: 'Pressure plate map', blurb: 'Which tiles are live.' },
  loot_value: { label: 'Loot valuation', blurb: 'What the goods are really worth.' },
  escape_routes: { label: 'Escape routes', blurb: '+1 on the getaway.' },
  hz_cat: { label: 'Hazard: Security Cat', blurb: 'There\'s a cat. Plan for it or be surprised.', hazard: 'cat' },
  hz_plates: { label: 'Hazard: Pressure plates', blurb: 'Hidden plates by the vault. Plan for them.', hazard: 'plates' },
  hz_silent: { label: 'Hazard: Silent alarm', blurb: 'The vault has a silent alarm. Known, it only makes the vault harder; unknown, it rings the Old Bill.', hazard: 'silent' },
  hz_stakeout: { label: 'Hazard: Police stakeout', blurb: 'The Inspector has a car watching the street at one time of day.', hazard: 'stakeout' },
};

export const FENCES = {
  hal: { name: 'Honest Hal\'s Pawnbrokers', blurb: 'Pays peanuts. Never grasses.', rates: { cash: 0.85, jewel: 0.5, art: 0.3, oddity: 0.5 } },
  francesca: { name: 'Fancy Francesca', blurb: 'Pays well. New in town.', rates: { cash: 0.9, jewel: 0.8, art: 0.65, oddity: 0.75 } },
  collector: { name: 'The Collector', blurb: 'Full value. By appointment.', rates: { cash: 1, jewel: 1, art: 1, oddity: 1 } },
};

export const CUTS = [
  { pct: 0, label: 'Stiff \'em', rel: -25 },
  { pct: 15, label: 'Tight', rel: -8 },
  { pct: 30, label: 'Fair', rel: 8 },
  { pct: 45, label: 'Generous', rel: 18 },
];

export const CHAOS = {
  good: [
    'A guard slips on a tennis ball. Out cold. Nobody saw a thing.',
    'The night guard is asleep in front of the telly. Snoring.',
    'A power cut! Lucky timing — or fate.',
    'A fox knocks over the bins outside. Every guard runs to look.',
    'The alarm panel is still in test mode. Nobody switched it back.',
  ],
  bad: [
    'A pizza delivery arrives. For the guards. Right now.',
    'A burglar alarm goes off next door. Police cars everywhere.',
    'Someone left a sausage roll on the counter. Concentration: gone.',
    'The cleaner is working late tonight. Humming loudly.',
    'A squirrel. On the windowsill. Staring.',
  ],
};

export const INTRO = [
  'Dogsbury. Rain on the cobbles, and a fortune in every vault.',
  'You\'re the Guv\'nor. You pick the job, the crew and the plan. Then you watch.',
  'Keep your cash up, your name clean, and the Inspector off your tail.',
];

// ------------------------------------------------------------------ groups
// The outfits that run the city. Each has a boss, a reputation threshold before
// they'll deal with you, rivals, what they like to buy, and what they do to
// people who cross them. Their members also turn up in the pub (FACTIONS).
export const GROUPS = {
  firm: {
    name: 'The Bulldog Firm', short: 'the Firm', emblem: '🥩', minRep: 30, rivals: ['poodle'], serious: false,
    boss: 'Brick Bone', bossTitle: 'Guv\'nor of the Bulldog Firm',
    bossDog: { breed: 'bulldog', faction: 'firm', look: { coat: '#c69064', hat: 'flatcap', eyes: 'none', neck: 'chain', outfit: '#4b2e2e', brow: 'stern', seed: 31 } },
    wants: ['oddity', 'cash'],
    intro: 'Brick Bone rolls into the Dog & Duck like weather. He sits in your chair. "Heard you\'re handy. I\'ve got work for handy. Do it right, you\'re one of the family. Do it wrong, you\'re sausages."',
    pitch: ['"In and out, no fuss, and I get my share. Simple."', '"Them posh poodles have had it too good for too long."', '"Nothing fancy. Just nick it and bring it round the back."'],
    thanks: ['"Lovely. That\'s what I like to see."', '"You\'re alright, you are."'],
    angry: ['"You\'ve made me look a mug. Nobody makes me look a mug."', '"You\'d better keep looking over your shoulder, sunshine."'],
    hostile: { effect: 'crew', text: 'Brick Bone\'s lads had a quiet word with {dog} in the car park. {dog} is not keen on working for you now.' },
  },
  ze: {
    name: 'Ze Germans', short: 'Ze Germans', emblem: '⚙️', minRep: 35, rivals: [], serious: false,
    boss: 'Herr Direktor Barkhausen', bossTitle: 'Chairman of Ze Germans',
    bossDog: { breed: 'shepherd', faction: 'ze', look: { coat: '#b8793a', hat: 'peaked', eyes: 'sunglasses', neck: 'none', outfit: '#1d1d22', brow: 'stern', seed: 32 } },
    wants: ['jewel', 'cash'],
    intro: 'A typed contract arrives in triplicate. Clause 1: Ze job. Clause 2: Ze fee. Clause 3: Failure is not in ze contract. It is signed, stamped, and smells faintly of sausage.',
    pitch: ['"Ze terms are precise. We expect ze same of you."', '"Efficiency. Discretion. Delivery. In zat order."', '"We have calculated your odds. Zey are acceptable."'],
    thanks: ['"Ze contract is fulfilled. Sehr gut."', '"Precisely as calculated."'],
    angry: ['"You have broken ze contract. Zis is noted."', '"Unacceptable. We will be less... cooperative."'],
    hostile: { effect: 'alert', text: 'Ze Germans sold your description to every security firm in town. Your next job will be tighter.' },
  },
  poodle: {
    name: 'The Poodle Set', short: 'the Poodle Set', emblem: '🎩', minRep: 40, rivals: ['firm'], serious: false,
    boss: 'Lady Arabella Fluffington-Smythe', bossTitle: 'Chair of the Poodle Set',
    bossDog: { breed: 'poodle', faction: 'poodle', look: { coat: '#f4f1ea', hat: 'none', eyes: 'monocle', neck: 'pearls', outfit: '#5a2b3a', brow: 'raised', seed: 33 } },
    wants: ['art', 'jewel'],
    intro: 'A card on thick cream paper, edged in gold: "Lady Arabella Fluffington-Smythe requests the pleasure of your discretion." On the back, in pencil: "We collect things. You acquire them. Tea on Thursday."',
    pitch: ['"One simply must have it for the collection, darling."', '"Those vulgar Bulldogs wouldn\'t know art if it bit them."', '"Do be careful. It\'s priceless. Well, it has a price. We\'ll pay it."'],
    thanks: ['"Exquisite. You may call me Arabella. Occasionally."', '"How frightfully competent of you."'],
    angry: ['"How terribly disappointing. You won\'t be invited again."', '"One is not amused. One is never amused, but especially not now."'],
    hostile: { effect: 'rep', text: 'The Poodle Set have been telling everyone at the Club that you\'re "trade". Your name is worth a little less.' },
  },
  family: {
    name: 'The Greyhound Family', short: 'the Family', emblem: '🌹', minRep: 45, rivals: ['syndicate'], serious: true,
    boss: 'Don Velvet Longshanks', bossTitle: 'Head of the Greyhound Family',
    bossDog: { breed: 'italiangreyhound', faction: 'family', look: { coat: '#9aa0ab', hat: 'trilby', eyes: 'none', neck: 'bowtie', outfit: '#1f2430', brow: 'stern', seed: 34 } },
    wants: ['jewel', 'art', 'cash'],
    intro: 'A long black car idles outside the Dog & Duck. The back window slides down. "The Don has been hearing your name," says a voice. "He\'d like to do you a favour. And one day, you\'ll do him one."',
    pitch: ['"The Don is asking. Nicely. This time."', '"Those Shibas think they own this town. Remind them."', '"Consider it an opportunity. The Don doesn\'t offer twice."'],
    thanks: ['"The Don is pleased. That\'s good for your health."', '"You did right by the Family. The Family remembers."'],
    angry: ['"You disrespected the Family. That\'s a debt now."', '"The Don is disappointed. You don\'t want the Don disappointed."'],
    hostile: { effect: 'heat', text: 'Somebody from the Family had a word in the Inspector\'s ear. Your file just got thicker.' },
    debtText: 'The Don sends his regards, and his accountant. You owe the Family {amount}. They\'d like it back, or a favour.',
    pressure: 'You\'ve kept the Don waiting. An anonymous caller tells the Inspector exactly where you drink.',
  },
  syndicate: {
    name: 'The Shiba Syndicate', short: 'the Syndicate', emblem: '🏮', minRep: 55, rivals: ['family'], serious: true,
    boss: 'Madam Sesame Curltail', bossTitle: 'Chairwoman of the Shiba Syndicate',
    bossDog: { breed: 'shiba', faction: 'syndicate', look: { coat: '#d9853b', hat: 'none', eyes: 'sunglasses', neck: 'scarf', outfit: '#e9e4da', brow: 'stern', seed: 35 } },
    wants: ['jewel', 'oddity', 'art'],
    intro: 'A folded note on your table, weighted by one perfect biscuit. "Your work is tidy. We value tidy. We also value promises kept. — S.C." Nobody saw who left it.',
    pitch: ['"A simple request. We expect a simple result."', '"The Greyhounds have grown careless. Help them learn."', '"We pay well for silence and precision."'],
    thanks: ['"Tidy. We will remember this, favourably."', '"A promise kept. Good."'],
    angry: ['"A promise broken is a debt. Debts are paid."', '"You have embarrassed us. We do not forget."'],
    hostile: { effect: 'cash', text: 'Your safe was opened last night. Nothing was broken. Nothing was left behind, either. The Syndicate took {amount}.' },
    debtText: 'A single biscuit, snapped in half, on your pillow. You owe the Syndicate {amount}. Pay it, or earn it back.',
    pressure: 'Madam Curltail\'s patience has run out. Your safe is lighter, and the Inspector got a very tidy anonymous letter.',
  },
};

// Venues some of the groups own. Robbing them makes enemies.
export const VENUE_OWNERS = {
  casino: ['family', 'syndicate'],
  jeweller: ['syndicate'],
  mansion: ['family'],
  butcher: ['firm'],
  auction: ['poodle'],
  show: ['poodle'],
};
