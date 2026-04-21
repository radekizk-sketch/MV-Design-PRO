import { useActiveObjectCard, useNetworkBuildStore } from './networkBuildStore';
import {
  BayCard,
  BranchPoleCard,
  LineSegmentCard,
  NnSwitchgearCard,
  RenewableSourceCard,
  SourceCard,
  StationCard,
  SwitchCard,
  TransformerCard,
  TrunkCard,
  ZksnCard,
} from './cards';

function assertNever(value: never): never {
  throw new Error(`Nieobsługiwany typ karty obiektu: ${JSON.stringify(value)}`);
}

export function ObjectCardRouter() {
  const activeObjectCard = useActiveObjectCard();
  const closeObjectCard = useNetworkBuildStore((state) => state.closeObjectCard);

  if (!activeObjectCard) {
    return null;
  }

  switch (activeObjectCard.kind) {
    case 'source':
      return <SourceCard elementId={activeObjectCard.elementId} />;
    case 'trunk':
      return <TrunkCard corridorRef={activeObjectCard.corridorRef} />;
    case 'station':
      return <StationCard elementId={activeObjectCard.elementId} />;
    case 'line_segment':
      return <LineSegmentCard elementId={activeObjectCard.elementId} />;
    case 'transformer':
      return <TransformerCard elementId={activeObjectCard.elementId} />;
    case 'switch':
      return <SwitchCard elementId={activeObjectCard.elementId} />;
    case 'bay':
      return <BayCard elementId={activeObjectCard.elementId} />;
    case 'nn_switchgear':
      return <NnSwitchgearCard elementId={activeObjectCard.elementId} />;
    case 'renewable_source':
      return <RenewableSourceCard elementId={activeObjectCard.elementId} />;
    case 'branch_pole':
      return <BranchPoleCard elementId={activeObjectCard.elementId} onClose={closeObjectCard} />;
    case 'zksn':
      return <ZksnCard elementId={activeObjectCard.elementId} onClose={closeObjectCard} />;
  }

  return assertNever(activeObjectCard);
}

export default ObjectCardRouter;
