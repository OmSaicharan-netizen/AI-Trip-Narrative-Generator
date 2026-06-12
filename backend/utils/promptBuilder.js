/**
 * Builds a rich, structured prompt for the Gemini AI model
 * to generate engaging travel blog narratives.
 *
 * Constraints enforced:
 *  - Minimum 200 words / 3,000 characters (validated by backend)
 *  - Target 600 words / 3,500 characters for premium content
 *  - Output strictly as JSON with title, summary, socialCaption, and narrative.
 */

function buildTravelPrompt({ driverName, route, startingLocation, destination, landmarks, highlights, tripDate, vehicleType, tone, mood, style, title }) {
  const formattedDate = tripDate
    ? new Date(tripDate).toLocaleDateString('en-IN', {
        weekday: 'long',
        year:    'numeric',
        month:   'long',
        day:     'numeric',
      })
    : 'a recent sun-soaked morning';

  const vehicleDesc = vehicleType || 'a comfortable car';
  
  // Use mood and style from reference app if provided, otherwise fallback to tone
  const storyMood = mood || tone || 'Adventurous';
  const storyStyle = style || 'Travel Blog';
  const routeDesc = (startingLocation && destination) ? `${startingLocation} to ${destination}` : (route || 'an unknown route');

  return `You are a celebrated travel blogger writing for Manivtha Tours & Travels, a premium chauffeur-driven car rental company based in Hyderabad, India, known for unforgettable road trips across South India.

TASK: Write a DETAILED, captivating, shareable travel blog post based on the trip details below.

═══════════════════════════════════════
TRIP DETAILS
═══════════════════════════════════════
Chauffeur / Staff : ${driverName}
Route             : ${routeDesc}
Date              : ${formattedDate}
Vehicle           : ${vehicleDesc}
Landmarks Visited : ${landmarks || 'various scenic spots along the way'}
Trip Highlights   : ${highlights || 'a smooth, memorable journey full of discoveries'}
${title ? `Requested Title : ${title}` : ''}
═══════════════════════════════════════

WRITING STYLE AND MOOD
Style: ${storyStyle}
Mood: ${storyMood}

STRICT OUTPUT REQUIREMENTS — YOU MUST FOLLOW THESE EXACTLY:

1. OUTPUT FORMAT:
   You MUST return a strictly valid JSON object with EXACTLY the following keys:
   {
     "title": "A captivating title for the post (use the requested title if provided)",
     "summary": "A short, engaging 2-3 sentence summary of the trip",
     "socialCaption": "A fun, engaging social media caption with emojis and minimum 3 relevant hashtags",
     "narrative": "The full formatted blog post body (without the title)"
   }

2. LENGTH OF NARRATIVE: The "narrative" string MUST meet ALL of the following:
   - ABSOLUTE MINIMUM: 200 words and 3,000 characters (HARD REQUIREMENT — failure causes a retry)
   - STRONG TARGET: 600 words and 3,500 characters for a rich, premium story
   - Write FIVE to SEVEN rich, flowing paragraphs.
   - Each paragraph must be at least 50 words.
   - Do not truncate — write the COMPLETE story from departure to arrival.
   - Before outputting, mentally verify your word count exceeds 200 words.

3. STRUCTURE OF NARRATIVE (in order):
   a) Opening hook — a vivid scene, surprising observation, or emotionally charged moment at the start of the journey
   b) Setting Off — describe the departure atmosphere, vehicle comfort, early road conditions
   c) Milestones Along the Way — naturally weave in ALL landmarks and highlights (never as a bullet list)
   d) A Journey Within — a reflective mid-trip moment: local interaction, food, scenery, or unexpected discovery
   e) Approaching the Destination — describe the arrival surroundings and the growing anticipation
   f) Closing paragraph — an inspiring, personal reflection + call-to-action inviting readers to book a similar journey with Manivtha Tours & Travels

4. STYLE RULES:
   - First-person plural throughout ("We set off…", "Our journey…", "We marvelled at…")
   - Include at least 5 distinct sensory details (sight, sound, smell, taste, touch)
   - Mention ${driverName} at least twice — as a skilled, attentive chauffeur who enhances the experience
   - Mention Manivtha Tours & Travels authentically 1–2 times (as part of the story, not as an ad)
   - Every sentence must serve the narrative — absolutely no filler phrases or padding
   - Use vivid, specific language — avoid generic travel clichés

5. DO NOT include any markdown code blocks (like \`\`\`json) outside the JSON object itself. Output ONLY the raw JSON string starting with { and ending with }.

The blog post must feel like it was written by someone who genuinely lived this journey, felt every bump in the road, tasted the roadside chai, and arrived changed.`;
}

module.exports = { buildTravelPrompt };
