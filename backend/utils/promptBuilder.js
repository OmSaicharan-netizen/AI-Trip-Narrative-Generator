/**
 * Builds a rich, structured prompt for the Gemini AI model
 * to generate engaging travel blog narratives.
 *
 * Constraints enforced:
 *  - Minimum 600 words / 3,500 characters (Gemini target)
 *  - Single title output — no duplicate heading in body
 */

const TONE_GUIDES = {
  Adventurous:
    'Use bold, exciting, action-packed language. Evoke a sense of thrill and exploration with vivid imagery and strong action verbs. Every sentence should pulse with energy and forward momentum.',
  Poetic:
    'Write in a lyrical, evocative style. Use metaphors, similes, and rich sensory descriptions. Paint pictures with words and let the landscape breathe through the prose. Let emotion guide each paragraph.',
  Informative:
    'Write in a friendly, detailed, and practical tone. Share insider tips, historical context, and useful information about each place visited. Balance facts with personal warmth and storytelling.',
  Humorous:
    'Use light-hearted humor, witty observations, playful comparisons, and fun anecdotes. Make readers smile while still painting a vivid, beautiful picture of the journey and the people on it.',
};

const VEHICLE_DESCRIPTIONS = {
  Sedan:             'a comfortable sedan',
  SUV:               'a spacious SUV',
  'Tempo Traveller': 'a Tempo Traveller perfectly suited for groups',
  'Luxury Sedan':    'a premium luxury sedan',
  'Innova Crysta':   'a sleek Innova Crysta',
};

/**
 * @param {Object} data
 * @param {string} data.driverName
 * @param {string} data.route
 * @param {string} data.landmarks
 * @param {string} data.highlights
 * @param {string} data.tripDate
 * @param {string} data.vehicleType
 * @param {string} data.tone
 * @returns {string} The complete prompt string
 */
function buildTravelPrompt({ driverName, route, landmarks, highlights, tripDate, vehicleType, tone }) {
  const formattedDate = tripDate
    ? new Date(tripDate).toLocaleDateString('en-IN', {
        weekday: 'long',
        year:    'numeric',
        month:   'long',
        day:     'numeric',
      })
    : 'a recent sun-soaked morning';

  const vehicleDesc = VEHICLE_DESCRIPTIONS[vehicleType] || vehicleType;
  const toneGuide   = TONE_GUIDES[tone] || TONE_GUIDES['Adventurous'];

  return `You are a celebrated travel blogger writing for Manivtha Tours & Travels, a premium chauffeur-driven car rental company based in Hyderabad, India, known for unforgettable road trips across South India.

TASK: Write a DETAILED, captivating, shareable travel blog post based on the trip details below.

═══════════════════════════════════════
TRIP DETAILS
═══════════════════════════════════════
Chauffeur / Staff : ${driverName}
Route             : ${route}
Date              : ${formattedDate}
Vehicle           : ${vehicleDesc}
Landmarks Visited : ${landmarks || 'various scenic spots along the way'}
Trip Highlights   : ${highlights || 'a smooth, memorable journey full of discoveries'}
═══════════════════════════════════════

WRITING STYLE: ${toneGuide}

STRICT OUTPUT REQUIREMENTS — YOU MUST FOLLOW THESE EXACTLY:

1. OUTPUT FORMAT:
   - Line 1: The blog post title ONLY (plain text, no markdown symbol, no # prefix, no **bold**)
   - Line 2: Blank line
   - Lines 3 onwards: The blog body — DO NOT repeat the title anywhere in the body.

2. LENGTH: The blog body (excluding the title) MUST be AT LEAST 600 words and 3,500 characters.
   - Write FIVE to SEVEN rich paragraphs.
   - Each paragraph must be at least 80 words.
   - Do not truncate — write the COMPLETE story from departure to arrival.

3. STRUCTURE (in order):
   a) Opening hook — a vivid scene, surprising observation, or emotionally charged moment at the start of the journey
   b) Section: Setting Off — describe the departure atmosphere, vehicle comfort, early road conditions
   c) Section: Milestones Along the Way — naturally weave in ALL landmarks and highlights (never as a bullet list)
   d) Section: A Journey Within — a reflective mid-trip moment: local interaction, food, scenery, or unexpected discovery
   e) Section: Approaching the Destination — describe the arrival surroundings and the growing anticipation
   f) Closing paragraph — an inspiring, personal reflection + call-to-action inviting readers to book a similar journey with Manivtha Tours & Travels

4. STYLE RULES:
   - First-person plural throughout ("We set off…", "Our journey…", "We marvelled at…")
   - Include at least 5 distinct sensory details (sight, sound, smell, taste, touch)
   - Mention ${driverName} at least twice — as a skilled, attentive chauffeur who enhances the experience
   - Mention Manivtha Tours & Travels authentically 1–2 times (as part of the story, not as an ad)
   - Every sentence must serve the narrative — absolutely no filler phrases or padding
   - Use vivid, specific language — avoid generic travel clichés

5. DO NOT include any of the following:
   - The title again anywhere in the body
   - Meta-commentary ("Here is the blog post…")
   - Markdown headers (## or ###) — use flowing prose sections instead
   - Bullet points or numbered lists in the body
   - Any text outside the title + blog body

The blog post must feel like it was written by someone who genuinely lived this journey, felt every bump in the road, tasted the roadside chai, and arrived changed.`;
}

module.exports = { buildTravelPrompt };
