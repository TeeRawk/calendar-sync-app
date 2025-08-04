'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-200 dark:bg-gray-700',
        className
      )}
      {...props}
    />
  );
}

// Skeleton components for specific use cases
function CardSkeleton() {
  return (
    <div className="card-mobile animate-pulse">
      <div className="space-mobile">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
          <Skeleton className="h-12 flex-1" />
          <Skeleton className="h-12 w-12 sm:w-auto sm:px-4" />
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="max-w-6xl mx-auto">
        {/* Welcome Section Skeleton */}
        <div className="mb-6 sm:mb-8">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>

        {/* Add Button Skeleton */}
        <div className="mb-6 sm:mb-8">
          <Skeleton className="h-11 w-48" />
        </div>

        {/* Cards Skeleton */}
        <div className="grid gap-4 sm:gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 lg:p-8">
      <div className="flex items-center space-x-2 sm:space-x-3 mb-4 sm:mb-6">
        <Skeleton className="h-6 w-6 sm:h-8 sm:w-8" />
        <Skeleton className="h-6 w-48" />
      </div>

      <div className="space-y-4 sm:space-y-6">
        {/* Form fields */}
        <div>
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-3 w-64 mt-1" />
        </div>
        <div>
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-3 w-72 mt-1" />
        </div>
        <div>
          <Skeleton className="h-4 w-36 mb-2" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-3 w-80 mt-1" />
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 sm:p-4">
          <Skeleton className="h-4 w-32 mb-2" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4 pt-2">
          <Skeleton className="h-11 w-full sm:w-24" />
          <Skeleton className="h-11 w-full sm:w-32" />
        </div>
      </div>
    </div>
  );
}

export { Skeleton, CardSkeleton, DashboardSkeleton, FormSkeleton };