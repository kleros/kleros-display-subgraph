import { PolicyUpdate as PolicyUpdateEvent } from "../generated/PolicyRegistry/PolicyRegistry"
import { Court } from "../generated/schema"
import { ipfs, log, json, Bytes } from "@graphprotocol/graph-ts";

export function handlePolicyUpdate(event: PolicyUpdateEvent): void {
  let court = Court.load(
    event.params._subcourtID.toString()
  )

  if (!court) {
    court = new Court(
      event.params._subcourtID.toString()
    )
  }
  court.policy = event.params._policy

  let jsonStr = ipfs.cat(event.params._policy);
  if (!jsonStr) {
    log.error('Failed to fetch policy #{} SubcourtID: {}', [event.params._policy, event.params._subcourtID.toString()]);
    court.save();
    return;
  }

  let jsonObjValueAndSuccess = json.try_fromBytes(jsonStr as Bytes);
  if (!jsonObjValueAndSuccess.isOk) {
    log.error(`Error getting json object value for policy #{} SubcourtID: {}`, [event.params._policy, event.params._subcourtID.toString()]);
    court.save();
    return;
  }

  let jsonObj = jsonObjValueAndSuccess.value.toObject();
  if (!jsonObj) {
    log.error(`Error converting object value for policy #{} SubcourtID: {}`, [event.params._policy, event.params._subcourtID.toString()]);
    court.save();
    return;
  }

  const name = jsonObj.get('name');
  court.name = name? name.toString() : null;

  const description = jsonObj.get('description');
  court.description = description? description.toString() : null;

  const requiredSkills = jsonObj.get('requiredSkills');
  court.requiredSkills = requiredSkills? requiredSkills.toString() : null;

  court.save();

}
