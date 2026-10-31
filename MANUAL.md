# Sephral’s Campaign Album: Manual

## The album

Open the album from the token controls on the left (images icon), with the button above the journal directory, or with the button of a photo's chat message.

* **Sessions:** the album shows the current session. The selection on top switches to another session or to all of them.
* **Large view:** click a photo. The arrows or the arrow keys go to the previous and next photo, Escape closes the view.
* **Slideshow:** shows every photo of the campaign, five seconds each, until you stop it.
* **Camera:** the camera button in the token controls or in the album takes a photo.
* **Open as journal:** the album is a normal journal with one page per session, readable without the module.

## For the GM

* **Photos of your own:** the camera button photographs the selected tokens, or your current view if no token is selected. Another GM's camera button asks the active GM, who takes the photo.
* **Captions:** in the large view, the pen changes the caption, the bin takes the photo out of the album.
* **New session:** a session ends on its own after some hours without photos (setting). The button *New session* lets the next photo start a new page right away.
* **Photos by players:** depending on the setting, a player's photo appears as a chat message only you see, with *Add* and *Decline*, or goes straight into the album.

## Whose eyes

Every photo is taken on one client, so it shows what that user saw, with lighting, vision, walls and fog of war:

1. A player who owns a character in the picture and looks at that scene.
2. Otherwise another player who looks at that scene.
3. Otherwise the active GM, if the GM looks at that scene. Photos from the GM's view leave out hidden tokens, hidden tiles and drawings and the map notes.

The view of that client moves for a fraction of a second if the moment is not on its screen and moves back before anything is shown, so nobody notices. The grid, selection frames, target markers, rulers, other users' cursors and wall or light handles never appear in a photo. With the setting *Always the GM's view* every photo is taken on the GM's client.

## Moments per game system

| Moment | Crucible | D&D 5e | Other systems |
| --- | --- | --- | --- |
| Critical hit | Critical success of an action | Critical attack roll | A natural 20 on a d20 |
| Fumble (off by default) | Critical failure of an action | Fumbled attack roll | A natural 1 on a d20 |
| A boss falls | Adversary of the boss rank defeated or dead | Creature with legendary actions or resistances defeated or dead | not recognized |
| Victory | The last hostile combatant of a fight falls | same | same |
| Farewell | A hero with a player dies | A player character dies (dead status or three failed death saves) | The dead status on a character with a player |
| Level up | A hero's level rises | A character's level rises | not recognized |
| Sunrise | The sun rises in Ember's calendar | The sun rises in the calendar of D&D 5e 6 or Ember | When the world calendar knows a sunrise |

Critical hits count for the player characters unless the setting says everyone. A boss photo replaces the victory photo of the same fight. A defeated mark and the dead status of the same creature give one photo. The sunrise photo shows the heroes on the current scene (or the GM's view when none are there), once per change of the world time even after a jump over several days, and not during a fight.

In D&D 5e the album also reads the quick roll cards of Ready Set Roll: the attack on the card decides, its damage does not, and each card gets at most one photo.

## Combat totals

With [Sephral’s Combat Log & Stats](https://foundryvtt.com/packages/sephrals-combat-log-stats) active, every session page ends with the battles of that game night: fights and rounds, the damage and healing of the heroes, defeated foes, how often a hero went down, critical hits and the hero of the night. The numbers come from Combat Log & Stats and hold only what players may see there, with the sharing choices of each fight. While player reports are off in Combat Log & Stats, no new totals reach the pages.

* A page counts the game nights of Combat Log & Stats that overlap the time of its photos, or the nearest one a few hours before or after.
* The totals follow the fights: they update with every new photo and when a fight ends or is changed later. Each start of the world brings every page up to date, so pages from before get their totals then too.
* Updating the totals changes only their part of the page, so notes you wrote into an older page stay.
* A page keeps its totals when Combat Log & Stats no longer finds the fights of that night, for example after player reports were turned off or old logs were removed, just like a report already posted.
* The setting *Combat totals on session pages* hides them on every page and shows them again.
* Without Combat Log & Stats, or with an older version of it, the album works as before. The GM then sees a small hint with a link at the bottom of the album window. Turning the setting off hides the hint too.

## Settings

All options are in *Game Settings → Configure Settings → Sephral’s Campaign Album*:

| Setting | What it does |
| --- | --- |
| Module language | Follow Foundry, German or English, for you |
| Automatic photos | Switches all automatic photos on or off |
| Critical hits, Fumbles, Fallen bosses, Victories, Farewells, Level ups, Sunrise | The moments the album captures on its own |
| Whose critical hits | Player characters or everyone in the fight |
| Automatic photos per session | Limit, 0 means no limit. Photos you take yourself do not count |
| Pause between automatic photos | Seconds before the next automatic photo |
| Through whose eyes | Through the players' eyes, or always the GM's view |
| Photos by players | Off, the GM decides, or straight into the album |
| Chat messages | A message with every new photo for everyone, only for the GM, or none |
| New session after | Hours without a photo after which the next photo starts a new session |
| Combat totals on session pages | The fights of each game night from Sephral’s Combat Log & Stats on its page, on by default (see [Combat totals](#combat-totals)) |
| Self test | Checks the album, the image folder and taking photos (GM) |
| Debug file | Saves a file for bug reports (GM), see below |

## Debug file

When an automatic photo is missing or comes at the wrong moment, a debug file shows what the album saw. It is one file for all of Sephral’s modules in the world, and the GM saves it in two places:

* *Save debug file* in the module settings: the latest 20 messages with rolls and every recent decision of the automatic photos.
* *Save Debug File (Sephral’s Modules)* in the context menu of a chat message: that one message.

The file holds the Foundry, system and module versions, the active modules, the settings of the modules, the chat messages with their rolls, for each message the crit or fumble the album found and the check that stopped the photo (no actor, not a player character, no token, moment switched off and so on), the result of each automatic photo since the last reload (limit, pause or a missing view) and the state of the album: journal, number of photos, the current session and whether the limit or the pause applies right now.

The file contains chat text and whispers. Check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video. The list is part of the module. Only a video you start is loaded, from the module page on GitHub.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For the Campaign Album it holds:

* on how many of the last 30 days the module was used
* how often photos are taken automatically or by hand, players send in photos, the slideshow runs, a new session page starts, captions are edited and photos are removed
* the settings *Automatic photos*, *Through whose eyes* and *Photos by players* (only the chosen option)
* where errors occur in the module code: file, line and error type, never the error message

No names, chat messages, notes, dice results or other content of the world are sent.

## Storage

* The album is the journal *Campaign Album*. Everyone may read it, only the GM changes it. Each session page keeps its photos and the combat totals of its night in the page's flags and shows them in its text.
* The images are WebP files in `worlds/<world>/sephrals-campaign-album/session-<n>/`, on The Forge in `sephrals-campaign-album/<world>/` of the Assets Library. A photo is about 100 to 500 KB.
* Foundry cannot delete files from a browser. A photo taken out of the album keeps its file in the folder. A declined player photo never becomes a file.
* Photos are stored by the active GM, who needs the permission to upload files (by default Assistant GM and Gamemaster).

## API

`game.modules.get("sephrals-campaign-album").api` offers:

| Function | What it does |
| --- | --- |
| `open({photoId})` | Opens the album, optionally at a photo |
| `takePhoto({kind, tokens, scene, frame, caption, actors})` | Takes a photo (active GM). `kind` is `manual` or one of the moments, `tokens` are tokens or token documents, `frame` a scene rectangle when there are no tokens |
| `photos()` | All photos in order, with their session |
| `journal()` | The album journal |
| `system()` | The rules of the running game system |
| `runSelfTest()` | Runs the self test (GM) |
| `saveDebugFile(messageId)` | Saves a debug file about one chat message, or without an id about the latest roll messages (GM) |

## Limits

* A GM has to be online for photos.
* A moment on a scene nobody looks at cannot be photographed.
* The GM's view shows the whole scene without the players' vision. When no player looks at the scene, the photo may show more of the map than the players know, but never hidden tokens.
* Effects that other modules draw outside the canvas (HTML overlays, for example) are not in the photo.
