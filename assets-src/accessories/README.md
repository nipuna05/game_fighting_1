# Accessory kit goes here (helmets, vests, backpacks, goggles, masks, hats ...)

One sub-folder per kit, named after the kit:

    assets-src/accessories/
      kit-name/
        *.glb / *.fbx / *.obj     the accessory models (or the kit's own folder structure, I can work with it)
        textures/                 if the kit has separate texture files
        CREDITS.txt               "Kit name - author - licence - link"

How they will be used: accessories attach to the character's bones (helmet and goggles to the head, vest and
backpack to the spine), so the Costume tab can offer them as options on top of the soldier.
They need to be sized for a normal human head / torso. Tell me which character they were made for.

Licence: keep CREDITS.txt up to date. Kits are kept out of git until a credit exists.
