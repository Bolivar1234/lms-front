"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface GamificationFeatures {
    xp: boolean;
    levels: boolean;
    streaks: boolean;
    leaderboard: boolean;
    achievements: boolean;
    store: boolean;
    custom_achievements: boolean;
    custom_store: boolean;
}

export interface RecentAchievement {
    slug: string | undefined;
    title: string | undefined;
    description: string | null | undefined;
    tier: string | undefined;
    category: string | undefined;
    icon: string | null | undefined;
    earned_at: string | null;
}

export interface RecentXpTransaction {
    action_type: string;
    xp_amount: number;
    reference_type: string | null;
    created_at: string | null;
}

export interface GamificationSummary {
    total_xp: number;
    level: number;
    level_title: string;
    level_icon: string | null;
    xp_progress: {
        current: number;
        required: number;
        percentage: number;
    };
    streak: {
        current: number;
        longest: number;
        freezes_available: number;
        last_activity: string | null;
    };
    coins: number;
    achievements: {
        earned: number;
        total: number;
        recent: RecentAchievement[];
        newly_earned: string[];
    };
    recent_xp: RecentXpTransaction[];
    features: GamificationFeatures;
}

/**
 * Fetches the summary from the edge function. Resolves to `undefined` when there
 * is no session (callers keep their current summary), `null` on failure.
 */
async function loadSummary(): Promise<GamificationSummary | null | undefined> {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) return undefined;

        const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-gamification-summary`,
            {
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            }
        );

        if (!response.ok) {
            // Edge function unavailable or user has no gamification profile in this tenant — use defaults
            console.warn("Gamification summary unavailable (status %d), using defaults", response.status);
            return null;
        }

        return await response.json();
    } catch (err) {
        // Network error or edge function not deployed — silently degrade
        console.warn("Gamification fetch failed, using defaults:", err instanceof Error ? err.message : err);
        return null;
    }
}

export function useGamificationSummary() {
    const [summary, setSummary] = useState<GamificationSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error] = useState<Error | null>(null);

    const fetchSummary = async () => {
        setLoading(true);
        const result = await loadSummary();
        if (result !== undefined) setSummary(result);
        setLoading(false);
    };

    useEffect(() => {
        // `loading` starts true, so the initial load only needs to settle it
        loadSummary().then((result) => {
            if (result !== undefined) setSummary(result);
            setLoading(false);
        });
    }, []);

    return { summary, loading, error, refresh: fetchSummary };
}
