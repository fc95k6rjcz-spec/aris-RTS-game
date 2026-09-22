import type { EntityId, PlayerId } from "./types";

/**
 * Commands are the ONLY way anything outside the sim changes sim state.
 * They are serialisable so they can later be sent over the wire for lockstep play.
 */
export type Command =
  | { type: "buildWallLine"; player: PlayerId; units: EntityId[]; tiles: Array<{x:number;y:number}> }
  | { type: "battleRally"; player: PlayerId; units: EntityId[] }
  | { type: "move"; player: PlayerId; units: EntityId[]; x: number; y: number; queue?: boolean }
  | { type: "gather"; player: PlayerId; units: EntityId[]; tx: number; ty: number }
  | { type: "build"; player: PlayerId; units: EntityId[]; building: string; tx: number; ty: number }
  | { type: "repair"; player: PlayerId; units: EntityId[]; target: EntityId }
  | { type: "train"; player: PlayerId; building: EntityId; unit: string }
  | { type: "cancelTrain"; player: PlayerId; building: EntityId; index: number }
  | { type: "cancelBuild"; player: PlayerId; building: EntityId }
  | { type: "upgrade"; player: PlayerId; building: EntityId }
  | { type: "cancelUpgrade"; player: PlayerId; building: EntityId }
  | { type: "stop"; player: PlayerId; units: EntityId[] }
  | { type: "attack"; player: PlayerId; units: EntityId[]; target: EntityId }
  | { type: "attackMove"; player: PlayerId; units: EntityId[]; x: number; y: number }
  | { type: "setRally"; player: PlayerId; building: EntityId; x: number; y: number }
  | { type: "research"; player: PlayerId; building: EntityId; upgrade: string }
  | { type: "cancelResearch"; player: PlayerId; building: EntityId };

