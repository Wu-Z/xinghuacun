# Nearby, Where To?

Say what kind of outing you want in one sentence. It picks the nearby places actually
worth going to and puts them in the best order.

[中文](README.md)

---

## What it does

**Describe what you want in a sentence.** No parameter picking — just write something like
"I want an old street with a cafe to sit down in, not too crowded."

**Two ways to set your starting point.** Use your browser location, or tap a spot on the map.
Map picking opens as a full-screen overlay and closes as soon as you choose.

**Preferences are optional.** Expand them if you want to be specific: how many people,
how much crowding you will tolerate, and roughly where you want to go. Anything left blank
is filled in with a default, and it tells you what it assumed instead of pretending you
said it.

**Recommendations arrive one at a time.** You do not wait for the whole batch to be
generated. While it works you can see which step it is on, stop it at any point, and later
pick up "finish the rest".

**Recommendations come in tiers, and each one explains itself.**

- Sorted into "top pick" and "also worth it", each tagged with what it is best at
  ("best for photos", "works in rain or heat")
- Every entry says what it suits and what it costs you
- "Details" opens: why it was recommended, best time of day, cost, crowding, getting there,
  and **what to do if this is the only place you go**
- It also lists what it assumed this time, what could not be verified, and which places it
  ruled out, and why

**Not happy with the batch? Ask again.** Follow up on a single place, or say
"give me a few less crowded ones" for the whole list.

**A place that holds several things can be split open.** Somewhere like Jimei School Village
gets broken into separate stops — Longzhou Pond, Jimei Dashe, the Jiageng buildings —
because only separate stops can be routed leg by leg.

**Once you have picked enough, it plans the route.** Stops are ordered for the shortest
path, and the travel mode is decided **per leg**: if two stops are close, you walk;
only the long leg gets a ride. You can also set a destination (heading home, say); if you
do not, the last stop is the end.

**Two views, one state.** "List" shows each place's write-up; "Itinerary" shows an ordered
timeline — stop N, how you get to each one, how long, how far. Switching back and forth
never loses the numbering or the order.

**Everything is visible on the map.** Numbered markers plus the route line, and a link to
Amap for every place.

**Weather feeds into the recommendations.** If rain is forecast, outdoor spots get pushed
down and indoor ones up. The home page sky follows the current weather and time of day.

## Where it refuses to lie to you

This is the thing this project cares about most:

- Distances shown are **straight-line distances**, and the interface says "straight line" —
  a real travel distance only exists once a route has been planned
- The timeline **does not schedule clock times**. It does not know how long you will stay or
  when a shop opens, so it does not invent a time
- Places Amap cannot verify **stay in the list, marked** "not verified by Amap" — they are
  never quietly dropped
- **If weather is unavailable, weather is not mentioned**, and the recommendation layer must
  state "weather unknown, indoor/outdoor not adjusted for it" instead of guessing
- If a leg of the route could not be planned, it says "N legs could not be planned" — it
  never passes off "0 min, 0.0 km" as a real result

## Quick start

Requires Node 20.9 or later.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:3000 .

**To try it with no API keys at all**, add these three lines to `.env.local`. It runs on
demo data (real place names in Xiamen) with local stand-ins for verification and routing,
so nothing is billed.

```bash
RECOMMEND_PROVIDER=mock
RECOMMEND_VERIFY=mock
ROUTE_PROVIDER=mock
```

**To use real data**, fill these in `.env.local`:

| Variable | What it is for |
| --- | --- |
| `AMAP_WEB_SERVICE_KEY` | Server-side coordinates, straight-line distances, opening status, route planning, weather |
| `NEXT_PUBLIC_AMAP_JS_KEY` | Renders the map in the browser; the key type must be "Web (JS API)" |
| `AMAP_JS_SECURITY_CODE` | Pairs with the map key above |
| `DEEPSEEK_API_KEY` | Server-side calls to the recommendation model |
| `DEEPSEEK_MODEL` | Model ID. Run `npm run models` first to see what your account can use — do not copy one blindly |

Then switch `RECOMMEND_PROVIDER` to `skill` to use real recommendations.

**About keys:** they only need to go in `.env.local`, which is never committed. The
`.env.example` in this repo holds **no secrets at all** — it is a template to copy, with
every key field left empty and only a few non-sensitive defaults (concurrency limit, which
provider to use, API base URL). Note that `NEXT_PUBLIC_AMAP_JS_KEY` does reach the browser,
so set up the domain allowlist on the Amap console for it.

Without an Amap key, the map area reports a load failure; the list and the itinerary still work.

## Pages

| Path | What it is |
| --- | --- |
| `/` | Home: describe what you want, set your starting point |
| `/plan` | Results: list and itinerary views, the map, picking, route planning |
| `/sky` | Weather layer preview: many weather conditions × times of day on one screen, for working on the weather visuals |

## Working on this project

The traps worth knowing, what each environment variable does (and its limits), and how the
tests are organised: [`docs/开发须知.md`](docs/开发须知.md) (in Chinese).
