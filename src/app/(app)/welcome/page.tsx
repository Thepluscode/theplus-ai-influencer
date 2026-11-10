import { COSTS } from '@/lib/credits';
import { OnboardingWizard } from './onboarding-wizard';

export default function WelcomePage() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-8 md:px-8">
      <OnboardingWizard personaCost={COSTS.INFLUENCER_RENDER} />
    </div>
  );
}
