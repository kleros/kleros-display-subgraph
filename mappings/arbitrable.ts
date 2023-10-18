import {
  MetaEvidence as MetaEvidenceEv,
  Dispute as DisputeEv,
  Evidence as EvidenceEv,
  Ruling as RulingEv,
} from "../generated/templates/Arbitrable/Arbitrable";
import {
    ArbitrableHistory,
    Evidence,
    Dispute,
    EvidenceGroup
  } from "../generated/schema"
import { ONE, ZERO} from "./const";
import {
    Bytes,
    crypto
  } from "@graphprotocol/graph-ts";
import { biToBytes } from "./kleros-liquid";

  export function handleMetaEvidence(ev: MetaEvidenceEv): void {
    const arbitrableHistory = new ArbitrableHistory(
      Bytes.fromByteArray(
        crypto.keccak256(ev.address.concat(biToBytes(ev.params._metaEvidenceID)))
      )
    );
    arbitrableHistory.metaEvidence = ev.params._evidence;
    arbitrableHistory.save();
  }
  
  export function handleDispute(ev: DisputeEv): void {
    const arbitrableHistory = ArbitrableHistory.load(
      Bytes.fromByteArray(
        crypto.keccak256(ev.address.concat(biToBytes(ev.params._metaEvidenceID)))
      )
    );
  
    const dispute = Dispute.load(ev.params._disputeID.toString());
    if (dispute == null) return;
    dispute.metaEvidenceId = ev.params._metaEvidenceID;
    if (arbitrableHistory != null)
      dispute.arbitrableHistory = arbitrableHistory.id;
    dispute.save();
  
    const evidenceGroupId = Bytes.fromByteArray(
      crypto.keccak256(ev.address.concat(biToBytes(ev.params._evidenceGroupID)))
    );
    let evidenceGroup = EvidenceGroup.load(evidenceGroupId);
    if (evidenceGroup == null) {
      evidenceGroup = new EvidenceGroup(evidenceGroupId);
      evidenceGroup.length = ZERO;
    }
    evidenceGroup.dispute = dispute.id;
    evidenceGroup.save();
  }
  
  export function handleEvidence(ev: EvidenceEv): void {
    const evidenceGroupId = Bytes.fromByteArray(
      crypto.keccak256(ev.address.concat(biToBytes(ev.params._evidenceGroupID)))
    );
    let evidenceGroup = EvidenceGroup.load(evidenceGroupId);
    if (evidenceGroup == null) {
      evidenceGroup = new EvidenceGroup(evidenceGroupId);
      evidenceGroup.length = ZERO;
    }
    evidenceGroup.length = evidenceGroup.length.plus(ONE);
    evidenceGroup.save();
  
    const evidence = new Evidence(
      Bytes.fromByteArray(
        crypto.keccak256(evidenceGroupId.concat(biToBytes(evidenceGroup.length)))
      )
    );
    evidence.URI = ev.params._evidence;
    evidence.group = evidenceGroup.id;
    evidence.creationTime = ev.block.timestamp;
    evidence.sender = ev.params._party;
    evidence.save();
  }
  
  export function handleRuling(ev: RulingEv): void {
    const dispute = Dispute.load(ev.params._disputeID.toString());
    if (dispute == null) return;
    dispute.ruling = ev.params._ruling;
    dispute.ruled = true;
    dispute.save();
  }
  