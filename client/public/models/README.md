# Character model

Put a rigged, animated glTF binary here named `character.glb` and the game uses it for every player
(auto-scaled, with idle/run animations picked by clip name). Without it the built-in blocky soldier is used.

Good free (CC0) sources: Quaternius (quaternius.com) and Kenney (kenney.nl). If the model faces the wrong
way, change `MODEL_YAW` in `client/src/main.ts`.
