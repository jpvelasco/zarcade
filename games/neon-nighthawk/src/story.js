// "Light Up Vanta": the story campaign. Five districts, three jobs each.
// Pure data, so the simulation, tests and screens all read the same script.
//
// HALO, the city's well-meaning computer, has dimmed Vanta for curfew on the
// night of the Lantern Festival. Mara runs Nighthawk Couriers; you are Kit.
// Every delivery sends light back into the streets.

export const SPEAKERS = {
  mara: { name: 'MARA', role: 'Dispatch', color: '#3fe5ff' },
  halo: { name: 'HALO', role: 'City computer', color: '#ff4f74' },
  ines: { name: 'GRANDMA INES', role: 'Sunrise Bakery', color: '#ffc857' },
  juno: { name: 'JUNO', role: 'Lowrise power hub', color: '#6df0bd' },
  noodle: { name: 'CHEF BAO', role: 'Night market', color: '#ff8a3d' },
  pixel: { name: 'PIXEL', role: 'Kid inventor', color: '#c775ff' },
  oso: { name: 'DR. OSO', role: 'Floodline vet', color: '#7b9dff' },
  sky: { name: 'CAPTAIN RAE', role: 'Skybridge tower', color: '#ffc857' },
  kids: { name: 'THE KIDS', role: 'Festival crew', color: '#ff5fb7' },
};

// Job kinds and what they ask of the player:
//   delivery  pick up, then drop off
//   multi     pick up, then visit every drop in any order
//   collect   gather every spark cell, then bring them to the hub
//   chase     catch something running away, then bring it home
//   stealth   delivery where three scanner locks end the job
//   express   delivery with a short window
//   finale    gather the three invitation pieces, then reach HALO's core
export const JOB_KINDS = ['delivery', 'multi', 'collect', 'chase', 'stealth', 'express', 'finale'];

export const CHAPTERS = [
  {
    id: 'lowrise',
    title: 'First Light',
    intro: [
      ['mara', 'Kit! HALO just switched off the whole city for curfew. On Lantern Festival night!'],
      ['mara', 'Folks still need things delivered. And every delivery we make, the lights come back a little.'],
      ['halo', 'Good evening, citizen. Darkness is very safe. Have you considered a nice nap?'],
    ],
    outro: [
      ['juno', 'Lowrise is glowing again! Look at those windows!'],
      ['mara', 'One district down. Next stop, the Night Market.'],
    ],
    jobs: [
      {
        kind: 'delivery',
        title: 'Warm Buns',
        client: 'ines',
        pickupName: 'Sunrise Bakery',
        dropName: 'Station 9 Firehouse',
        cargo: 'a basket of warm cinnamon buns',
        patrols: 0,
        brief: [
          ['ines', 'The night crew at the firehouse cannot fight fires on an empty tummy, dear.'],
          ['mara', 'Hold a direction and the Nighthawk goes that way. Hold one early and it takes the next turn for you.'],
        ],
        radio: {
          pickup: ['ines', 'Still warm! Scoot, scoot!'],
          done: ['mara', 'See those lights flicker on behind you? That was you.'],
        },
      },
      {
        kind: 'collect',
        title: 'Spark Hunt',
        client: 'juno',
        items: 4,
        itemName: 'spark cell',
        dropName: 'Lowrise Power Hub',
        cargo: 'spark cells',
        patrols: 1,
        brief: [
          ['juno', 'A truck of spark cells tipped over and they rolled all over Lowrise!'],
          ['juno', 'Grab all four and bring them to my hub. I will do the rest.'],
          ['mara', 'Watch for HALO drones. Tap E to pulse and they will get confused for a bit.'],
        ],
        radio: {
          halfway: ['juno', 'Ooh, that one is buzzing. Keep going!'],
          pickup: ['juno', 'That is all of them! Come on home.'],
          done: ['juno', 'The hub is humming. Just one more job for full power!'],
        },
      },
      {
        kind: 'multi',
        title: 'Lantern Drop',
        client: 'kids',
        items: 3,
        pickupName: 'Lantern Workshop',
        dropNames: ['Maple Rooftop', 'Corner Garden', 'Bus Stop 12'],
        cargo: 'paper lanterns',
        patrols: 1,
        brief: [
          ['kids', 'We made one hundred lanterns! Well. Ninety-one. Some got squished.'],
          ['mara', 'Grab them and drop one at each rooftop. Any order you like.'],
        ],
        radio: {
          pickup: ['kids', 'Careful, they are paper!'],
          halfway: ['kids', 'It is working! The street is glowing!'],
          done: ['mara', 'That is the whole district. Lowrise is ALIVE.'],
        },
      },
    ],
  },
  {
    id: 'market',
    title: 'Night Market',
    intro: [
      ['mara', 'The Night Market never sleeps. HALO is trying really hard to make it.'],
      ['halo', 'Attention shoppers: the market is closed. Please enjoy a relaxing cup of nothing.'],
    ],
    outro: [
      ['noodle', 'The market is BACK! Free noodles for every courier!'],
      ['mara', 'Floodline next. Bring a raincoat.'],
    ],
    jobs: [
      {
        kind: 'delivery',
        title: 'Noodle Rush',
        client: 'noodle',
        pickupName: 'Bao Noodle Bar',
        dropName: 'Tower Hotel',
        cargo: 'very full soup',
        fragile: true,
        patrols: 1,
        brief: [
          ['noodle', 'This soup is filled to the brim. Bumps spill it. Cars spill it. Drones spill it!'],
          ['mara', 'Fragile cargo takes extra damage. Dash with Space to phase right through traffic.'],
        ],
        radio: {
          pickup: ['noodle', 'Do not slosh! Smooth corners!'],
          done: ['noodle', 'Not a drop spilled? You are a legend.'],
        },
      },
      {
        kind: 'chase',
        title: 'Runaway Bolt',
        client: 'pixel',
        runner: 'bot',
        runnerName: 'Bolt the delivery bot',
        dropName: "Pixel's Workshop",
        cargo: 'Bolt, a very sorry robot',
        patrols: 1,
        brief: [
          ['pixel', 'My delivery robot Bolt got scared of the dark and ran off with the firework remote!'],
          ['pixel', 'He is fast, but a Dash will catch him. Please do not squish him.'],
        ],
        radio: {
          pickup: ['pixel', 'You got him! Bolt, say sorry. ...He says beep.'],
          done: ['pixel', 'Fireworks remote secured! This is going to be the BEST festival.'],
        },
      },
      {
        kind: 'multi',
        title: 'Market Lanterns',
        client: 'kids',
        items: 3,
        pickupName: 'Lantern Workshop',
        dropNames: ['Dumpling Stall', 'Arcade Roof', 'Fish Market'],
        cargo: 'paper lanterns',
        patrols: 2,
        brief: [
          ['kids', 'The market lanterns are the fancy ones. They have tassels!'],
        ],
        radio: {
          pickup: ['kids', 'Tassels secured!'],
          halfway: ['noodle', 'I can see my stall again!'],
          done: ['mara', 'Market Stack is shining. On to Floodline.'],
        },
      },
    ],
  },
  {
    id: 'floodline',
    title: 'Rainlight',
    intro: [
      ['mara', 'Floodline gets all the rain. Streets are slippery, so ease into corners.'],
      ['halo', 'Rain detected. Recommended activity: staying indoors and counting raindrops.'],
    ],
    outro: [
      ['oso', 'The rain looks like falling stars with the lights back on.'],
      ['mara', 'Skybridge is next. Fast roads, lots of drones.'],
    ],
    jobs: [
      {
        kind: 'collect',
        title: 'Puddle Sparks',
        client: 'oso',
        items: 5,
        itemName: 'spark cell',
        dropName: 'Floodline Pump Station',
        cargo: 'spark cells',
        patrols: 1,
        brief: [
          ['oso', 'The pump station ran out of sparks and the puddles are getting deep.'],
          ['oso', 'Five cells should do it. Mind the slippery corners!'],
        ],
        radio: {
          halfway: ['oso', 'Splendid! A few more.'],
          pickup: ['oso', 'That is all five. To the pumps!'],
          done: ['oso', 'Pumps are pumping. My puddle frogs are furious.'],
        },
      },
      {
        kind: 'stealth',
        title: 'Quiet Lullaby',
        client: 'oso',
        pickupName: 'Oso Animal Clinic',
        dropName: 'Floodline Kitten Shelter',
        cargo: 'a music box that plays lullabies',
        scanLimit: 3,
        patrols: 2,
        brief: [
          ['oso', 'The shelter kittens cannot sleep in the dark. This music box helps.'],
          ['mara', 'HALO wants that music box for "noise violations." Three scanner locks and it gets confiscated.'],
          ['mara', 'Stay out of the red cones. Pulse jams them, Echo sends them after a fake bike.'],
        ],
        radio: {
          pickup: ['oso', 'Shhh. Softly now.'],
          done: ['oso', 'Listen. Purring. Forty kittens, all purring.'],
        },
      },
      {
        kind: 'chase',
        title: 'Catch Biscuit',
        client: 'oso',
        runner: 'cat',
        runnerName: 'Biscuit the cat',
        dropName: 'Oso Animal Clinic',
        cargo: 'one soggy, grumpy cat',
        patrols: 2,
        brief: [
          ['oso', 'Biscuit escaped. He is wearing the Floodline hub key on his collar!'],
          ['oso', 'He runs when he sees you, but he cannot outrun a Dash.'],
        ],
        radio: {
          pickup: ['oso', 'Got him! He is making a noise like a tiny kettle.'],
          done: ['mara', 'Hub key turned. Floodline is lit!'],
        },
      },
    ],
  },
  {
    id: 'skybridge',
    title: 'High Wire',
    intro: [
      ['sky', 'Skybridge Control here. HALO has drones on every bridge.'],
      ['halo', 'I have noticed an increase in light. I do not like it. It is very... bright.'],
    ],
    outro: [
      ['sky', 'Every bridge is lit from end to end. You can see the Core from here.'],
      ['mara', 'One district left. HALO lives in The Core. Time to talk to it.'],
    ],
    jobs: [
      {
        kind: 'express',
        title: 'Express Fuse',
        client: 'sky',
        pickupName: 'Skybridge Depot',
        dropName: 'Bridge Control',
        cargo: 'a glowing fuse',
        patrols: 2,
        brief: [
          ['sky', 'Bridge Control is running on one flashlight. I need that fuse FAST.'],
          ['mara', 'Short window on this one. Dash on the straights.'],
        ],
        radio: {
          pickup: ['sky', 'The clock is ticking, courier!'],
          done: ['sky', 'Power restored! And I can put the flashlight down.'],
        },
      },
      {
        kind: 'multi',
        title: 'Bridge Beacons',
        client: 'sky',
        items: 4,
        pickupName: 'Skybridge Depot',
        dropNames: ['North Span', 'East Span', 'Cable Tower', 'Sky Garden'],
        cargo: 'beacon bulbs',
        patrols: 3,
        brief: [
          ['sky', 'Four beacons keep the sky-trams on track. All four are dark.'],
        ],
        radio: {
          pickup: ['sky', 'Bulbs loaded. Go, go!'],
          halfway: ['sky', 'Trams are moving again!'],
          done: ['sky', 'All beacons green. Beautiful work.'],
        },
      },
      {
        kind: 'stealth',
        title: 'Secret Invitation',
        client: 'kids',
        pickupName: 'Skybridge School',
        dropName: 'Core Gate',
        cargo: 'a hand-drawn festival invitation',
        scanLimit: 3,
        patrols: 3,
        brief: [
          ['kids', 'We made an invitation for HALO. Maybe it is just lonely up there.'],
          ['mara', 'If HALO scans it early, the surprise is ruined. Three locks and we are done.'],
        ],
        radio: {
          pickup: ['kids', 'Do not peek! It has glitter.'],
          done: ['mara', 'The invitation is at the gate. Let us finish this.'],
        },
      },
    ],
  },
  {
    id: 'core',
    title: 'Festival of Light',
    intro: [
      ['halo', 'Courier. You have relit four districts. Why?'],
      ['mara', 'Because people want to see each other, HALO. That is what the festival is for.'],
      ['halo', '...Explain it to me. Carefully. I am listening.'],
    ],
    outro: [
      ['halo', 'I read the invitation. Nobody ever invited me anywhere before.'],
      ['halo', 'Turning every light in Vanta on. Also, launching fireworks. Is that correct?'],
      ['kids', 'THAT IS SO CORRECT!'],
      ['mara', 'Happy Lantern Festival, Kit. You lit up the whole city.'],
    ],
    jobs: [
      {
        kind: 'collect',
        title: 'Core Sparks',
        client: 'mara',
        items: 5,
        itemName: 'spark cell',
        dropName: 'Core Relay',
        cargo: 'spark cells',
        patrols: 3,
        brief: [
          ['mara', 'The Core relay needs a big charge before HALO will open the tower.'],
          ['halo', 'I will not make this easy. It is nothing personal. I am just very thorough.'],
        ],
        radio: {
          halfway: ['halo', 'You are persistent. I am making a note.'],
          pickup: ['mara', 'Full load. Get to the relay!'],
          done: ['halo', 'Relay charged. ...The tower doors are open. I am curious now.'],
        },
      },
      {
        kind: 'chase',
        title: 'Catch the Spark',
        client: 'pixel',
        runner: 'bot',
        runnerName: 'a runaway firework',
        dropName: 'Festival Square',
        cargo: 'the Grand Firework',
        patrols: 3,
        brief: [
          ['pixel', 'Uh oh. The Grand Firework has little rocket boots. And it is running away.'],
        ],
        radio: {
          pickup: ['pixel', 'Got it! It is fizzing. Hurry!'],
          done: ['pixel', 'Grand Firework ready for launch!'],
        },
      },
      {
        kind: 'finale',
        title: 'The Invitation',
        client: 'halo',
        items: 3,
        itemName: 'invitation piece',
        dropName: 'HALO Core',
        cargo: 'the festival invitation',
        patrols: 4,
        brief: [
          ['halo', 'I scattered your invitation across The Core. A test. Bring me all three pieces.'],
          ['mara', 'This is it, Kit. Every drone in the city is out. Use everything you have.'],
        ],
        radio: {
          halfway: ['halo', 'Two pieces. I can almost read it. It says... "you are invited"?'],
          pickup: ['halo', 'All three pieces. Bring them to me. I will open the way.'],
          done: ['halo', 'Oh. Oh! There is a drawing of me. I am smiling in it.'],
        },
      },
    ],
  },
];

export const JOBS_PER_CHAPTER = 3;
export const CHAPTER_COUNT = CHAPTERS.length;

export function jobFor(chapter, job) {
  return CHAPTERS[chapter]?.jobs[job] || null;
}

// A few things HALO says when a drone locks on. Chosen by scan count so the
// same night always plays out the same way.
export const HALO_SCAN_LINES = [
  'Citizen detected. Have you tried going to bed?',
  'I see you. You are very shiny.',
  'Scanning complete. You are 100% out past curfew.',
  'Please stop being so fast. It is making my drones dizzy.',
  'Curfew reminder: pajamas are extremely comfortable.',
];
