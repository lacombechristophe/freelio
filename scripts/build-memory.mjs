// Next's CLI type checker starts Node without the parent's command-line flags.
// Keep the build budget in the environment inherited by that compiler.
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--max-old-space-size=4096"].filter(Boolean).join(" ")
