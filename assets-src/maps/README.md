# Map models go here

One folder per map, named after the map:

    assets-src/maps/
      my-map-name/
        map.glb            <- the 3D map (GLB is best; FBX / OBJ also work with their textures folder)
        textures/          <- only if the model came with separate texture files
        CREDITS.txt        <- "Map name - author - licence - link"
        notes.txt          <- optional: where the two bomb sites (A and B) and the two spawn areas are

What I do with it: the game keeps its own simple collision layout (walls, bomb sites, spawns, loot) separate from the
drawing. For your map I will draw the model and build the collision from its walls and buildings, then place the bomb sites
and spawns. Tell me in notes.txt (or a screenshot with A, B, Team 1 and Team 2 marked) where they should go.

Good maps for this game:
- roughly 1600 x 1200 game units across (any size is fine, I scale it)
- mostly flat ground, with walls and buildings players can hide behind
- under about 150,000 triangles and 20 MB, otherwise it will be slow in a browser
- Y axis up (the usual for GLB)

Licence: CC0 needs no credit. CC-BY needs a line in CREDITS.txt. Models are kept out of git until a credit exists.
