<?php
declare(strict_types=1);

// Built-in accounts. Only password_hash() values live here; never plaintext.
// demo uses the public demo-only credentials shown on the sign-in screen; wf (Weng) shares that password by request.
// Change a password with: php tools/set-password.php <username>  (writes a git-ignored override in storage/).
return [
    'demo' => ['displayName' => 'Demo Patient', 'demo' => true, 'hash' => '$2y$12$4C2By2G6S5DVQVZpabGHEeA0n1m.j/nbYyoc/JRDpmMsjQ/Kj.IKW'],
    'wf' => ['displayName' => 'Weng', 'demo' => false, 'hash' => '$2y$12$lhtLGvyZmz1UYvQddfYFDubLLWrQi8O5zeU1QXgSAyg4k1iFvhynO'],
];
