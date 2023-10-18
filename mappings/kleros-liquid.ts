import {
  AppealDecision as AppealDecisionEv,
  AppealPossible as AppealPossibleEv,
  DisputeCreation as DisputeCreationEv,
  NewPeriod as NewPeriodEv,
  Draw as DrawEv,
  TokenAndETHShift as TokenAndETHShiftEv,
  KlerosLiquid,
  ChangeSubcourtTimesPerPeriodCall,
  CreateSubcourtCall} from "../generated/KlerosLiquid/KlerosLiquid";
import { Arbitrable as ArbitrableContract } from "../generated/templates";
import {
  Dispute,
  Draw,
  Round,
  TokenAndETHShift,
  Counter,
  Court,
  UserRoundInfo,
  UserDisputeInfo,
} from "../generated/schema";
import { ONE, ZERO, ZERO_B } from "./const";
import { BigInt, Bytes, crypto, log } from "@graphprotocol/graph-ts";

export class Period {
  static readonly EVIDENCE: string = "EVIDENCE";
  static readonly COMMIT: string = "COMMIT";
  static readonly VOTE: string = "VOTE";
  static readonly APPEAL: string = "APPEAL";
  static readonly EXECUTED: string = "EXECUTED";

  static parse(status: i32): string {
    switch (status) {
      case 0:
        return this.EVIDENCE;
      case 1:
        return this.COMMIT;
      case 2:
        return this.VOTE;
      case 3:
        return this.APPEAL;
      case 4:
        return this.EXECUTED;
      default:
        return "Error";
    }
  }
}


export function ChangeSubcourtTimesPerPeriodCallHandler(call: ChangeSubcourtTimesPerPeriodCall): void {
  const subcourt = call.inputs._subcourtID.toString();
  let court = Court.load(subcourt)

  if (!court) {
    log.error("Court {} does not existC", [subcourt]);
    return;
  }

  court.timesPerPeriod = call.inputs._timesPerPeriod;
  court.save();
}

export function CreateSubcourtCallHandler(call: CreateSubcourtCall): void {
  let counter = Counter.load("Court");
  if (!counter) {
    counter = new Counter("Court");
    // general court created in constructor
    counter.counter = BigInt.fromU32(1);
  }

  const court = new Court(counter.counter.toString());

  court.hiddenVotes = call.inputs._hiddenVotes;
  court.timesPerPeriod = call.inputs._timesPerPeriod;

  counter.counter = counter.counter.plus(BigInt.fromI32(1));
  counter.save();
  court.save();
}


export function biToBytes(bi: BigInt): Bytes {
  return bi.isZero() ? ZERO_B : Bytes.fromByteArray(Bytes.fromBigInt(bi));
}

export function handleDisputeCreation(ev: DisputeCreationEv): void {
  ArbitrableContract.create(ev.params._arbitrable);
  const contract = KlerosLiquid.bind(ev.address)

  if (ev.params._disputeID.equals(ZERO)) {
    const court = new Court(ZERO.toString());
    const subcourtData = contract.getSubcourt(ZERO);
    court.timesPerPeriod = subcourtData.getTimesPerPeriod();
    const subcourtData2 = contract.courts(ZERO);
    court.hiddenVotes = subcourtData2.getHiddenVotes();
    court.save();
  }

  const dispute = new Dispute(ev.params._disputeID.toString());
  dispute.arbitrated = ev.params._arbitrable;
  dispute.metaEvidenceId = ZERO;
  dispute.ruling = ZERO;
  dispute.ruled = false;
  dispute.period = Period.EVIDENCE;
  dispute.createdAtBlock = ev.block.number;
  let counter = Counter.load(dispute.period);
  if (counter == null) {
    counter = new Counter(dispute.period);
    counter.counter = ZERO;
  }
  dispute.periodNotificationIndex = counter.counter;
  counter.counter = counter.counter.plus(ONE);
  counter.save();
  dispute.lastPeriodChangeTs = ev.block.timestamp;
  dispute.lastPeriodChangeBlock = ev.block.number;
  contract.disputes(ev.params._disputeID).getSubcourtID();
  dispute.court = contract.disputes(ev.params._disputeID).getSubcourtID().toString();
  const court = Court.load(dispute.court);
  if (court == null) {
    log.error("Court {} does not existB", [dispute.court]);
    return;
  }
  dispute.periodDeadline = ev.block.timestamp.plus(
    court.timesPerPeriod![0]
  );
  dispute.nbRounds = ONE;
  dispute.nbChoices = contract
    .disputes(ev.params._disputeID)
    .getNumberOfChoices();
  
  const roundID = Bytes.fromByteArray(
    crypto.keccak256(biToBytes(ev.params._disputeID).concat(ZERO_B))
  )
  dispute.currentRound = roundID
  dispute.save();

  const round = new Round(roundID);
  round.dispute = dispute.id;
  round.round = ZERO
  round.isCurrentRound = true;
  round.jurors = [];
  round.save();
}

export function handleAppealPossible(ev: AppealPossibleEv): void {
  const dispute = Dispute.load(ev.params._disputeID.toString());
  if (dispute == null) return;
  dispute.period = Period.APPEAL;
  dispute.lastPeriodChangeTs = ev.block.timestamp;
  dispute.lastPeriodChangeBlock = ev.block.number;
  dispute.save();
}

export function handleAppealDecision(ev: AppealDecisionEv): void {
  const dispute = Dispute.load(ev.params._disputeID.toString());
  if (dispute == null) return;

  const roundOld = new Round(
    Bytes.fromByteArray(
      crypto.keccak256(
        biToBytes(ev.params._disputeID).concat(biToBytes(dispute.nbRounds.minus(ONE)))
      )
    )
  );

  if (!roundOld) return;
  roundOld.isCurrentRound = false;

  const round = new Round(
    Bytes.fromByteArray(
      crypto.keccak256(
        biToBytes(ev.params._disputeID).concat(biToBytes(dispute.nbRounds))
      )
    )
  );
  round.dispute = dispute.id;
  round.jurors = [];
  round.isCurrentRound = true;
  round.round = dispute.nbRounds;
  round.save();

  dispute.period = Period.EVIDENCE;
  dispute.lastPeriodChangeTs = ev.block.timestamp;
  dispute.lastPeriodChangeBlock = ev.block.number;
  dispute.nbRounds = dispute.nbRounds.plus(ONE);
  dispute.save();
}

export function handleNewPeriod(ev: NewPeriodEv): void {
  const dispute = Dispute.load(ev.params._disputeID.toString());
  if (dispute == null) return;

  dispute.period = Period.parse(ev.params._period);

  if (dispute.period != Period.EXECUTED) {
    const court = Court.load(dispute.court);
    if (court == null) {
      log.error("Court {} does not existA", [dispute.court]);
      return;
    }
    dispute.periodDeadline = ev.block.timestamp.plus(
      court.timesPerPeriod![ev.params._period]
    );
  }

  let counter = Counter.load(dispute.period);
  if (counter == null) {
    counter = new Counter(dispute.period);
    counter.counter = ZERO;
  }

  dispute.periodNotificationIndex = counter.counter;
  counter.counter = counter.counter.plus(ONE);
  counter.save();
  dispute.lastPeriodChangeTs = ev.block.timestamp;
  dispute.lastPeriodChangeBlock = ev.block.number;
  dispute.save();
}

export function handleDraw(ev: DrawEv): void {
  const roundID = Bytes.fromByteArray(
    crypto.keccak256(
      biToBytes(ev.params._disputeID).concat(biToBytes(ev.params._appeal))
    )
  )
  const round = Round.load(roundID);
  if (round == null) return;

  let userDisputeInfo = UserDisputeInfo.load(ev.params._disputeID.toString()+"-"+ev.params._address.toHexString());
  if (userDisputeInfo == null) {
    userDisputeInfo = new UserDisputeInfo(ev.params._disputeID.toString()+ev.params._address.toHexString());
    userDisputeInfo.dispute = ev.params._disputeID.toString();
    userDisputeInfo.juror = ev.params._address.toHexString();
    userDisputeInfo.save();
  }

  let userRoundInfo = UserRoundInfo.load(ev.params._disputeID.toString()+"-"+ev.params._address.toHexString()+"-"+ev.params._appeal.toString());
  if (userRoundInfo == null) {
    userRoundInfo = new UserRoundInfo(ev.params._disputeID.toString()+ev.params._address.toHexString());
    userRoundInfo.dispute = ev.params._disputeID.toString();
    userRoundInfo.juror = ev.params._address.toHexString();
    userRoundInfo.round = roundID;
    let counter = Counter.load("draws");
    if (counter == null) {
      counter = new Counter("draws");
      counter.counter = ZERO;
    }
    userRoundInfo.drawNotificationIndex = counter.counter;
    counter.counter = counter.counter.plus(ONE);
    counter.save();
    userRoundInfo.save();
  }

  const draw = new Draw(
    `${ev.params._disputeID}-${ev.params._appeal}-${ev.params._voteID}`
  );
  draw.disputeID = ev.params._disputeID;
  draw.appeal = ev.params._appeal;
  draw.voteID = ev.params._voteID;
  draw.address = ev.params._address;
  draw.save();

  round.jurors.push(ev.params._address);
  round.save();
}

export function handleTokenAndETHShift(ev: TokenAndETHShiftEv): void {
  // Keep rolling until we find a free ID
  let i = 0;
  while (true) {
    const shift = TokenAndETHShift.load(
      `${ev.params._disputeID}-${ev.params._address.toHexString()}-${i}`
    );
    if (shift == null) break;
    i++;
  }

  const shift = new TokenAndETHShift(
    `${ev.params._disputeID}-${ev.params._address.toHexString()}-${i}`
  );
  shift.ETHAmount = ev.params._ETHAmount;
  shift.address = ev.params._address;
  shift.disputeID = ev.params._disputeID;
  shift.tokenAmount = ev.params._tokenAmount;
  shift.save();
}
