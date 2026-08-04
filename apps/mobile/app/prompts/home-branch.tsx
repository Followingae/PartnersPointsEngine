import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { PromptSheet } from '@/components/PromptSheet';
import { Small } from '@/components/UI';
import { getBranchVisits, setHomeBranch } from '@/lib/api';
import { dismiss, markShown, settle } from '@/lib/prompts';
import { useAsync } from '@/lib/useAsync';
import { C, R, font } from '@/lib/tokens';

/**
 * 86 · Home branch popup.
 *
 * Offered from where they actually go — the till records a branch on every
 * transaction, so the suggestion is a fact rather than a guess. It is still a
 * suggestion: inferring a home area from behaviour and acting on it without
 * asking is how a shop somebody visited once starts following them around.
 *
 * The design said "Worth 100 pts". Nothing pays for this, so the line says what
 * it actually does — offers from the other side of the country stop showing up.
 */
export default function HomeBranchPrompt() {
  const router = useRouter();
  const { data } = useAsync(getBranchVisits, []);
  const [choice, setChoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    markShown();
  }, []);

  const visits = data ?? [];
  const top = visits[0];

  useEffect(() => {
    if (top && choice === null) setChoice(top.branchId);
  }, [top, choice]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  // Nothing to suggest yet — a customer with no recorded visits has no home area.
  useEffect(() => {
    if (data && visits.length === 0) {
      void dismiss('home-branch');
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, visits.length]);

  async function save() {
    if (!choice) return;
    setSaving(true);
    setFailed(null);
    try {
      await setHomeBranch(choice);
      await settle('home-branch');
      router.replace({ pathname: '/prompts/saved', params: { what: 'Home area' } });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save that.');
      setSaving(false);
    }
  }

  return (
    <PromptSheet
      title={top ? `You visit ${top.branchName} most often` : 'Where do you shop most?'}
      body="Set it as your home area and offers from other emirates stop showing up."
      primaryLabel="Set as home area"
      onPrimary={save}
      primaryLoading={saving}
      primaryDisabled={!choice || saving}
      secondaryLabel="Not now"
      onSecondary={() => {
        void dismiss('home-branch', true);
        close();
      }}
      onDismiss={() => {
        void dismiss('home-branch');
        close();
      }}
    >
      <View style={{ gap: 8 }}>
        {visits.slice(0, 3).map((v) => {
          const on = choice === v.branchId;
          return (
            <Pressable
              key={v.branchId}
              onPress={() => setChoice(v.branchId)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: C.canvas,
                  borderRadius: R.tile,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderWidth: 1.5,
                  borderColor: on ? C.ink : 'transparent',
                },
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: on ? C.ink : C.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: C.ink }} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: font(600), fontSize: 14.5, lineHeight: 20, color: C.ink }}>
                  {v.branchName}
                </Text>
                <Small style={{ marginTop: 2, fontSize: 12, lineHeight: 17 }}>
                  {`${v.brandName} · ${v.visits} ${v.visits === 1 ? 'visit' : 'visits'}`}
                </Small>
              </View>
            </Pressable>
          );
        })}
      </View>

      {failed ? (
        <Text style={{ marginTop: 12, fontFamily: font(500), fontSize: 12.5, lineHeight: 18, color: C.crimson }}>
          {failed}
        </Text>
      ) : null}
    </PromptSheet>
  );
}
