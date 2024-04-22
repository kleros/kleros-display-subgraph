import { PolicyUpdate as PolicyUpdateEvent } from "../generated/PolicyRegistry/PolicyRegistry";
import { Court, CourtMetadata } from "../generated/schema";
import { json, Bytes, dataSource } from "@graphprotocol/graph-ts";
import { CourtMetadata as CourtMetadataTemplate } from "../generated/templates";

export function handlePolicyUpdate(event: PolicyUpdateEvent): void {
  let court = Court.load(event.params._subcourtID.toString());

  if (!court) {
    court = new Court(event.params._subcourtID.toString());
  }

  const ipfsHash = event.params._policy.replace("/ipfs/", "");
  court.policy = ipfsHash;
  court.metadata = ipfsHash;

  CourtMetadataTemplate.create(ipfsHash);
  court.save();
}

export function handleCourtMetadata(content: Bytes): void {
  let courtMetadata = new CourtMetadata(dataSource.stringParam());
  const value = json.fromBytes(content).toObject();

  if (value) {
    const name = value.get("name");
    courtMetadata.name = name ? name.toString() : null;

    const description = value.get("description");
    courtMetadata.description = description ? description.toString() : null;

    const requiredSkills = value.get("requiredSkills");
    courtMetadata.requiredSkills = requiredSkills
      ? requiredSkills.toString()
      : null;
    courtMetadata.save();
  }
}
