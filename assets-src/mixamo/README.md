# Mixamo files go here

    assets-src/mixamo/
      character/
        soldier.fbx            <- the character (FBX Binary, T-pose, "With Skin")
        textures/ (if Mixamo gave you a textures folder, keep it next to soldier.fbx)
      animations/
        idle.fbx               <- idle animation (FBX Binary, "Without Skin")
        run.fbx                <- run animation (FBX Binary, "Without Skin", "In Place" ticked)
        (optional) walk.fbx, shoot.fbx, die.fbx

Mixamo's terms let you use these in your own game but not redistribute the raw files,
so everything in this folder except this README is ignored by git (see ../../.gitignore).
