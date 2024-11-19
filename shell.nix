with import <nixpkgs> {};

let 
  pkgs = import (builtins.fetchTarball "https://github.com/NixOS/nixpkgs/tarball/nixos-24.05/a80e3605e53b8af223a7f6415e29aac9a6edb7b8") {};
in mkShell {
  name = "Apéro-code Typescript";

  packages = [
    pkgs.nodejs_22
  ];

}
