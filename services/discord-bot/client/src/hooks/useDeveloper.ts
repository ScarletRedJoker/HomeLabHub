import { useQuery } from "@tanstack/react-query";

export function useDeveloper() {
  const { data, isLoading } = useQuery<{ isDeveloper: boolean; developer?: any }>({
    queryKey: ['/api/dev/auth/profile'],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  
  return { 
    isDeveloper: data?.isDeveloper || false,
    developer: data?.developer,
    isLoading
  };
}
